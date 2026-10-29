// Prueba aislada: PGLITE_MODULE=/ruta/node_modules/@electric-sql/pglite/dist/index.js node scripts/probar-edicion-oc.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite')
const db = new PGlite()
const empresa = '11111111-1111-1111-1111-111111111111'
await db.exec(`
create role anon; create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql as $$select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid$$;
create function public.mi_empresa_id() returns uuid language sql as $$select '${empresa}'::uuid$$;
create function public.mi_rol() returns text language sql as $$select coalesce(nullif(current_setting('test.rol',true),''),'admin')$$;
create function public.is_platform_admin() returns boolean language sql as $$select coalesce(nullif(current_setting('test.platform',true),''),'false')::boolean$$;
create table ocs(id text primary key, empresa_id uuid, numero text, estado text,
 proveedor_id text, proveedor_nombre text, fecha text, fecha_entrega text,
 bodega_id text,bodega_nombre text,notas text,items jsonb,total numeric,
 recepciones jsonb,folio_factura text,metodo_pago text,fecha_confirmacion text);
create table productos(id text primary key,empresa_id uuid);
create table producto_stock(producto_id text references productos(id),bodega_id text,cantidad numeric check(cantidad>=0),primary key(producto_id,bodega_id));
create table lotes_inventario(id text primary key,empresa_id uuid,producto_id text,bodega_id text,
 cantidad_inicial numeric,cantidad_restante numeric,costo_unitario numeric,
 origen text,oc_id text,oc_item_id text,fecha text,creado_en timestamptz);
create table erp_data(empresa_id uuid,clave text,datos jsonb,actualizado_en timestamptz,primary key(empresa_id,clave));
create table movimientos_inventario(id text primary key,empresa_id uuid,fecha text,hora text,tipo text,productos jsonb,
 bodega_origen text,bodega_destino text,referencia text,referencia_id text,notas text,usuario text);
`)
await db.exec(`
create table asientos_contables(empresa_id uuid,id text,datos jsonb,actualizado_en timestamptz,primary key(empresa_id,id));
create function public.fn_cuenta_contable_json(uuid,text) returns jsonb language sql as $$select jsonb_build_object('id',$2,'codigo',$2,'nombre',$2)$$;
create function public.fn_siguiente_asiento_empresa(uuid) returns integer language sql as $$select 1$$;
`)
const contabilidad = readFileSync(new URL('../supabase/migrations/20260915140000_asientos_contables_atomicos.sql',import.meta.url),'utf8')
await db.exec(contabilidad.slice(contabilidad.indexOf('create or replace function public.fn_sync_asiento_oc()'),contabilidad.indexOf('-- Regenera documentos')))
await db.exec(readFileSync(new URL('../supabase/migrations/20261029140000_editar_oc_atomica.sql',import.meta.url),'utf8'))
const item = (patch={}) => ({id:'i1',producto_id:'p1',producto_nombre:'Producto 1',cantidad:10,precio_neto:100,precio_iva:119,precio_unitario:100,subtotal:1190,bodega_id:'b1',bodega_nombre:'Tienda 1',...patch})
async function seed({estado='confirmada', recibidas=10, usadas=0, cantidad=10, lotes=true}={}) {
 await db.exec(`truncate asientos_contables,ocs,lotes_inventario,movimientos_inventario,erp_data,producto_stock,productos; set test.rol='admin'; set test.platform='false';`)
 await db.query('insert into productos values ($1,$2),($3,$2)', ['p1',empresa,'p2'])
 await db.query('insert into erp_data values ($1,$2,$3,now())',[empresa,'bodegas',JSON.stringify([{id:'b1',nombre:'Tienda 1'},{id:'b2',nombre:'Tienda 2'}])])
 const recepciones=recibidas?[{id:'r1',fecha:'2026-10-20',bodega_id:'b1',bodega_nombre:'Tienda 1',items:[{prod_item_id:'i1',producto_id:'p1',producto_nombre:'Producto 1',cantidad:recibidas}]}]:[]
 await db.query(`insert into ocs(id,empresa_id,numero,estado,proveedor_id,proveedor_nombre,fecha,bodega_id,bodega_nombre,items,total,recepciones,folio_factura,metodo_pago)
 values ('oc1',$1,'OC-001', $2,'prov1','Proveedor','2026-10-20','b1','Tienda 1',$3,$4,$5,'123','banco')`,[empresa,estado,JSON.stringify([item({cantidad,subtotal:cantidad*119})]),cantidad*119,JSON.stringify(recepciones)])
 await db.query('insert into producto_stock values ($1,$2,$3)',['p1','b1',recibidas-usadas])
 if(lotes && recibidas) await db.query(`insert into lotes_inventario values ('l1',$1,'p1','b1',$2,$3,100,'oc','oc1','i1','2026-10-20',now())`,[empresa,recibidas,recibidas-usadas])
}
async function current(){return (await db.query('select to_jsonb(o) as o from ocs o where id=$1',['oc1'])).rows[0].o}
async function stock(p='p1',b='b1'){return Number((await db.query('select cantidad from producto_stock where producto_id=$1 and bodega_id=$2',[p,b])).rows[0]?.cantidad??0)}
async function save(items, patch={}, original){ const old=original??await current();return db.query('select public.fn_editar_oc($1,$2,$3,$4)',['oc1',JSON.stringify(old),JSON.stringify({...old,items,...patch}),empresa]) }
let passed=0
async function test(name,run){try{await run();passed++;console.log('OK',name)}catch(e){console.error('FALLO',name);throw e}}
await test('aumentar una OC confirmada suma solo la diferencia',async()=>{await seed();await save([item({cantidad:12})]);assert.equal(await stock(),12);assert.equal((await current()).total,1428);assert.equal((await current()).estado,'confirmada')})
await test('reducir cantidades conserva las unidades utilizadas',async()=>{await seed({usadas:3});await save([item({cantidad:7})]);assert.equal(await stock(),4);const l=(await db.query('select * from lotes_inventario where id=\'l1\'')).rows[0];assert.equal(Number(l.cantidad_inicial),7);assert.equal(Number(l.cantidad_restante),4)})
await test('reducir por debajo de lo usado revierte toda la edición',async()=>{await seed({usadas:3});const before=await current();await assert.rejects(save([item({cantidad:2})]),/ya se utilizaron/);assert.equal(await stock(),7);assert.deepEqual(await current(),before)})
await test('cambiar producto revierte el anterior y recibe el nuevo',async()=>{await seed();await save([item({producto_id:'p2',producto_nombre:'Producto 2'})]);assert.equal(await stock(),0);assert.equal(await stock('p2'),10)})
await test('no permite cambiar un producto ya consumido',async()=>{await seed({usadas:1});await assert.rejects(save([item({producto_id:'p2',producto_nombre:'Producto 2'})]),/ya se utilizaron/);assert.equal(await stock(),9);assert.equal(await stock('p2'),0)})
await test('cambiar bodega mueve stock y preserva la cantidad recibida',async()=>{await seed();await save([item({bodega_id:'b2',bodega_nombre:'Tienda 2'})]);assert.equal(await stock(),0);assert.equal(await stock('p1','b2'),10)})
await test('corregir costo actualiza capas sin duplicar stock',async()=>{await seed({usadas:2});await save([item({precio_neto:200,precio_iva:238,precio_unitario:200})]);assert.equal(await stock(),8);assert.equal((await current()).total,2380);assert.equal(Number((await db.query('select costo_unitario from lotes_inventario where id=\'l1\'')).rows[0].costo_unitario),200)})
await test('aumentar una OC parcial no recibe mercadería pendiente',async()=>{await seed({estado:'parcial',recibidas:4});await save([item({cantidad:12})]);assert.equal(await stock(),4);assert.equal((await current()).estado,'parcial')})
await test('una línea nueva de una OC totalmente recibida agrega stock',async()=>{await seed();await save([item(),item({id:'i2',producto_id:'p2',producto_nombre:'Producto 2',cantidad:2})]);assert.equal(await stock('p2'),2)})
await test('quitar una línea recibida revierte solo su stock',async()=>{await seed();await save([item({id:'i2',producto_id:'p2',producto_nombre:'Producto 2',cantidad:2})]);assert.equal(await stock(),0);assert.equal(await stock('p2'),2)})
await test('recepciones sin lotes requieren revisión y no crean stock doble',async()=>{await seed({lotes:false});await assert.rejects(save([item({cantidad:12})]),/no coincide con sus lotes/);assert.equal(await stock(),10)})
await test('metadatos de OC antiguas sin enlace al catálogo siguen editables',async()=>{await seed({lotes:false});const old=await current();await save(old.items,{notas:'Nota corregida'});assert.equal((await current()).notas,'Nota corregida');assert.equal(await stock(),10)})
await test('detecta una edición concurrente',async()=>{await seed();const old=await current();await db.query('update ocs set notas=$1',['Cambio externo']);await assert.rejects(save([item()],{notas:'Otra'},old),/cambió mientras/);assert.equal((await current()).notas,'Cambio externo')})
await test('rechaza productos de otra empresa',async()=>{await seed();await db.query('insert into productos values ($1,$2)',['ajeno','22222222-2222-2222-2222-222222222222']);await assert.rejects(save([item({producto_id:'ajeno'})]),/esta empresa/)})
await test('valida permisos incluso con empresa explícita',async()=>{await seed();await db.exec("set test.rol='vendedor'");await assert.rejects(save([item()]),/no tiene permiso/)})
await test('registra auditoría antes y después y movimientos de stock',async()=>{await seed();await save([item({cantidad:12})]);assert.equal((await db.query("select count(*)::int as n from erp_data where clave like 'oc-edicion-%'")).rows[0].n,1);assert.equal((await db.query('select count(*)::int as n from movimientos_inventario')).rows[0].n,1)})
await test('bloquea stock insuficiente sin aplicar ajustes parciales',async()=>{await seed();await db.exec('update producto_stock set cantidad=1');const before=await current();await assert.rejects(save([item({cantidad:5})]),/Stock insuficiente/);assert.deepEqual(await current(),before);assert.equal(Number((await db.query("select cantidad_restante from lotes_inventario where id='l1'")).rows[0].cantidad_restante),10)})
await test('actualiza el asiento existente con factura, fecha y pago corregidos',async()=>{
 await seed(); await save([item({cantidad:12})],{folio_factura:'999',metodo_pago:'credito',fecha:'2026-10-29'});
 const a=(await db.query("select datos from asientos_contables where id='as-oc-oc1'")).rows[0].datos;
 assert.equal(a.fecha,'2026-10-29');assert.match(a.descripcion,/999/);assert.equal(a.lineas.at(-1).cuenta_id,'pc-210');
 assert.equal(a.lineas.at(-1).haber,1428);assert.equal((await db.query('select count(*)::int as n from asientos_contables')).rows[0].n,1);
})
await test('mantiene recepciones en varias bodegas y retira primero unidades disponibles',async()=>{
 await seed({recibidas:4,usadas:2,cantidad:10});
 await db.exec("insert into lotes_inventario select 'l2',empresa_id,'p1','b2',6,5,100,'oc','oc1','i1','2026-10-21',now()+interval '1 hour' from ocs; insert into producto_stock values ('p1','b2',5);");
 const old=await current();old.recepciones.push({id:'r2',fecha:'2026-10-21',bodega_id:'b2',items:[{prod_item_id:'i1',producto_id:'p1',cantidad:6}]});
 await db.query('update ocs set recepciones=$1',[JSON.stringify(old.recepciones)]);
 await save([item({cantidad:7})]);assert.equal(await stock(),2);assert.equal(await stock('p1','b2'),2);
 const q=(await db.query('select sum(cantidad_inicial)::int as inicial,sum(cantidad_restante)::int as restante from lotes_inventario')).rows[0];
 assert.deepEqual(q,{inicial:7,restante:4});
})
await test('una segunda corrección usa correctamente las recepciones de ajuste',async()=>{
 await seed();await save([item({cantidad:12})]);await save([item({cantidad:8})]);assert.equal(await stock(),8);
 const old=await current();const n=old.recepciones.flatMap(r=>r.items).reduce((sum,i)=>sum+i.cantidad,0);assert.equal(n,8);
})
await test('una línea nueva en una OC parcial queda pendiente sin generar stock',async()=>{
 await seed({estado:'parcial',recibidas:4});await save([item(),item({id:'i2',producto_id:'p2',producto_nombre:'Producto 2',cantidad:2})]);assert.equal(await stock('p2'),0);assert.equal((await current()).estado,'parcial');
})
await test('cambiar costo preserva los costos históricos de venta',async()=>{
 await seed({usadas:2});await db.exec("create table if not exists venta_items(id text,costo_unitario numeric,costo_total numeric);truncate venta_items;insert into venta_items values ('venta1',100,200)");
 await save([item({precio_neto:200,precio_iva:238})]);assert.deepEqual((await db.query('select costo_unitario,costo_total from venta_items')).rows[0],{costo_unitario:'100',costo_total:'200'});
})
await test('los campos opcionales nulos se comparan como los hidrata la aplicación',async()=>{
 await seed({estado:'borrador',recibidas:0});await db.exec('update ocs set recepciones=null');
 const old=await current();old.recepciones=[];await save([item()],{notas:'Datos corregidos'},old);
 assert.equal((await current()).notas,'Datos corregidos');assert.equal(await stock(),0);
})
console.log(`${passed} pruebas SQL aprobadas`)
await db.close()
