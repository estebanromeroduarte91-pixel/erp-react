from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent / "real-ui-captures"
FONT_PATH = "/System/Library/Fonts/SFNS.ttf"
FONT_BOLD_PATH = "/Library/Fonts/SF-Pro-Display-Semibold.otf"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_BOLD_PATH if bold else FONT_PATH, size)


def open_real(name: str) -> Image.Image:
    return Image.open(ROOT / f"{name}-real.png").convert("RGB")


def save(image: Image.Image, name: str) -> None:
    image.save(ROOT / f"{name}-sanitized.png", quality=96)


def label(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, size: int = 15,
          color: str = "#24262b", bold: bool = False) -> None:
    draw.text(xy, text, font=font(size, bold), fill=color)


def replace(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], text: str,
            *, bg: str = "#ffffff", color: str = "#24262b", size: int = 15,
            bold: bool = False, inset: tuple[int, int] = (8, 7)) -> None:
    draw.rectangle(box, fill=bg)
    label(draw, (box[0] + inset[0], box[1] + inset[1]), text, size, color, bold)


# Órdenes: clientes y teléfonos de demostración.
img = open_real("ordenes")
d = ImageDraw.Draw(img)
rows = [
    ("Martina Ríos", "+56 9 0000 1001"),
    ("Nicolás Vega", "+56 9 0000 1002"),
    ("Paula Mena", "+56 9 0000 1003"),
    ("Tomás Silva", "+56 9 0000 1004"),
    ("Fernanda Lagos", "+56 9 0000 1005"),
    ("Diego Araya", "+56 9 0000 1006"),
]
for i, (name, phone) in enumerate(rows):
    y = 414 + i * 61
    bg = "#fff7f5" if i >= 3 else "#ffffff"
    d.rectangle((625, y, 866, y + 56), fill=bg)
    label(d, (645, y + 8), name, 15, "#202124", True)
    label(d, (645, y + 29), phone, 13, "#8e8e93")
save(img, "ordenes")


# Ficha de una orden: identidad, serie y descripción completamente ficticias.
img = open_real("ficha")
d = ImageDraw.Draw(img)
replace(d, (541, 165, 1028, 195), "Martina Ríos   11.111.111-1 · +56 9 0000 1001",
        bg="#eaf5ff", color="#265cae", size=15, inset=(0, 6))
replace(d, (515, 341, 803, 374), "SN-DEMO-48271", bg="#f8f8fa", color="#8e8e93", size=14)
replace(d, (515, 716, 1123, 745), "Cambio de pantalla y revisión general.",
        bg="#f8f8fa", color="#44474f", size=14)
save(img, "ficha")


# Comisiones: técnico y montos de ejemplo, sin bloques ni desenfoques.
img = open_real("comisiones")
d = ImageDraw.Draw(img)
replace(d, (388, 272, 555, 311), "$48.420", size=27, bold=True, color="#b45309", inset=(0, 1))
replace(d, (681, 272, 845, 311), "$22.650", size=27, bold=True, color="#047857", inset=(0, 1))
replace(d, (388, 514, 625, 544), "Mateo Soto", size=15, bold=True, inset=(0, 5))
replace(d, (624, 752, 770, 783), "Mateo Soto", size=14, inset=(0, 6))
replace(d, (624, 817, 770, 844), "Mateo Soto", size=14, inset=(0, 5))
replace(d, (1070, 511, 1185, 544), "$48.420", size=15, bold=True, color="#b45309", inset=(8, 6))
replace(d, (1425, 511, 1514, 544), "$22.650", size=15, inset=(6, 6))
replace(d, (1070, 554, 1185, 585), "$48.420", bg="#f7f8fa", size=15, bold=True, inset=(8, 6))
replace(d, (1425, 554, 1514, 585), "$22.650", bg="#f7f8fa", size=15, bold=True, inset=(6, 6))
replace(d, (1144, 743, 1230, 785), "$189.900", size=14, inset=(4, 8))
replace(d, (1325, 743, 1414, 785), "$30.240", size=15, bold=True, inset=(5, 5))
label(d, (1270, 771), "20% sobre neto", 11, "#8e8e93")
replace(d, (1144, 808, 1230, 844), "$154.500", size=14, inset=(4, 7))
replace(d, (1325, 808, 1414, 844), "$18.180", size=15, bold=True, inset=(5, 5))
label(d, (1270, 833), "20% sobre neto", 11, "#8e8e93")
save(img, "comisiones")


# Compras: proveedores y totales ficticios.
img = open_real("compras")
d = ImageDraw.Draw(img)
suppliers = ["TecnoSur SpA", "Repuestos Nova", "Insumos Andes", "PuntoDigital Ltda.",
             "Componentes Uno", "Importadora Lumen", "Servicio Central"]
totals = ["$72.500", "$184.900", "$53.400", "$28.990", "$116.800", "$64.300", "$39.990"]
for i, (supplier, total) in enumerate(zip(suppliers, totals)):
    y = 357 + i * 68
    replace(d, (540, y, 850, y + 43), supplier, size=15, inset=(7, 8))
    replace(d, (1048, y, 1165, y + 43), total, size=15, inset=(7, 8))
save(img, "compras")


# Derivaciones: clientes, equipos y técnicos externos ficticios.
img = open_real("derivados")
d = ImageDraw.Draw(img)
for y, person, device, technician in [
    (398, "Martina Ríos", "MacBook Pro 14 [Apple]", "Taller externo · Leo M."),
    (460, "Nicolás Vega", "iPad Air 5 [Apple]", "Taller externo · Sofía P."),
]:
    d.rectangle((397, y, 770, y + 57), fill="#ffffff")
    label(d, (400, y + 8), person, 15, "#202124", True)
    label(d, (400, y + 29), device, 13, "#8e8e93")
    d.rectangle((775, y, 974, y + 57), fill="#ffffff")
    label(d, (777, y + 8), technician, 14)
    label(d, (777, y + 29), "+56 9 0000 2000", 12, "#8e8e93")
save(img, "derivados")


# Dashboard: reemplazo del cliente de la fila visible por un nombre de muestra.
img = open_real("dashboard")
d = ImageDraw.Draw(img)
replace(d, (735, 790, 1015, 844), "Martina Ríos", size=14, bold=True, inset=(8, 8))
save(img, "dashboard")


# Gastos: cifras simuladas con el mismo tratamiento visual del producto.
img = open_real("gastos")
d = ImageDraw.Draw(img)
replace(d, (292, 226, 490, 264), "$3.246.800", size=27, bold=True, inset=(5, 0))
replace(d, (747, 226, 840, 264), "48", size=27, bold=True, inset=(0, 0))
replace(d, (1193, 226, 1390, 264), "$3.246.800", size=27, bold=True, inset=(3, 0))
expense_values = ["$1.420.000", "$486.000", "$382.500", "$214.000", "$168.900", "$147.300", "$132.100", "$96.000", "$82.000"]
for i, value in enumerate(expense_values):
    y = 448 + i * 45
    replace(d, (1504, y, 1605, y + 30), value, size=14, bold=True, inset=(0, 4))
save(img, "gastos")


# Ventas: métricas, clientes y totales de demostración.
img = open_real("ventas")
d = ImageDraw.Draw(img)
for box, value, color in [
    ((292, 231, 610, 270), "$8.420.650", "#059669"),
    ((745, 231, 1065, 270), "$7.076.176", "#2563eb"),
    ((1193, 231, 1510, 270), "$4.118.420", "#7c3aed"),
]:
    replace(d, box, value, size=27, bold=True, color=color, inset=(0, 0))
for box, value in [
    ((740, 357, 935, 389), "81 ventas · 93%   $7.810.500"),
    ((740, 400, 935, 432), "4 ventas · 5%   $410.150"),
    ((740, 443, 935, 475), "2 ventas · 2%   $200.000"),
]:
    replace(d, box, value, size=13, bold=True, color="#202124", inset=(0, 5))
replace(d, (971, 445, 1240, 486), "$322.480.000", size=25, bold=True,
        color="#159a64", inset=(0, 3))
replace(d, (971, 512, 1240, 550), "$301.250.000", size=25, bold=True,
        color="#159a64", inset=(0, 3))
replace(d, (971, 380, 1110, 421), "1284", size=25, bold=True, inset=(0, 3))
replace(d, (530, 728, 730, 774), "Martina Ríos", size=15, inset=(8, 9))
replace(d, (530, 790, 730, 836), "Cliente demostración", size=15, inset=(8, 9))
replace(d, (1295, 726, 1415, 775), "$129.990", size=15, bold=True, inset=(28, 8))
replace(d, (1295, 790, 1415, 838), "$24.990", size=15, bold=True, inset=(28, 8))
save(img, "ventas")


for name in ("inventario", "pos", "cargos"):
    save(open_real(name), name)


# QR de demostración: conserva la pantalla real y usa un enlace ficticio seguro.
img = open_real("qr")
d = ImageDraw.Draw(img)
d.rounded_rectangle((716, 330, 919, 532), radius=10, fill="white", outline="#d9dde6", width=2)
cell = 11
for y in range(346, 511, cell):
    for x in range(732, 897, cell):
        if ((x // cell) * 3 + (y // cell) * 5 + (x // cell) * (y // cell)) % 7 < 3:
            d.rectangle((x, y, x + cell - 1, y + cell - 1), fill="black")
replace(d, (675, 548, 962, 586), "https://pixit.cl/fotos/demo", bg="#ffffff", color="#9aa0aa", size=13, inset=(26, 8))
save(img, "qr")


# Encuadres editoriales: se elimina la navegación general y se amplía únicamente
# el módulo que explica cada publicación. Todos quedan en la misma proporción que
# la ventana utilizada en las piezas para evitar recortes automáticos.
def feature_crop(name: str, box: tuple[int, int, int, int]) -> None:
    source = Image.open(ROOT / f"{name}-sanitized.png").convert("RGB")
    crop = source.crop(box)
    canvas = Image.new("RGB", (1381, 595), "#f3f4f7")
    scale = min(canvas.width / crop.width, canvas.height / crop.height)
    resized = crop.resize(
        (round(crop.width * scale), round(crop.height * scale)),
        Image.Resampling.LANCZOS,
    )
    canvas.paste(resized, ((canvas.width - resized.width) // 2, (canvas.height - resized.height) // 2))
    canvas.save(ROOT / f"{name}-feature-sanitized.png", quality=98)


for feature_name, feature_box in {
    "dashboard": (255, 55, 1636, 650),
    "ordenes": (255, 55, 1636, 650),
    "ficha": (480, 42, 1155, 333),
    "pos": (255, 55, 1636, 650),
    "inventario": (255, 55, 1636, 650),
    "comisiones": (350, 140, 1525, 735),
    "gastos": (255, 65, 1636, 660),
    "compras": (255, 65, 1636, 660),
    "qr": (480, 145, 1155, 740),
    "cargos": (255, 55, 1230, 650),
    "derivados": (255, 55, 1636, 650),
    "ventas": (255, 55, 1636, 650),
}.items():
    feature_crop(feature_name, feature_box)

print("Capturas con datos ficticios creadas en", ROOT)
