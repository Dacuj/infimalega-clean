"""Generate the editorial pages and the static Infimalega catalogue."""

from html import escape
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "dist"
CATALOG = json.loads((ROOT / "catalog.json").read_text())
EDITORIAL = json.loads((ROOT / "editorial.json").read_text())
SERIES = CATALOG["series"]
PRODUCTS = CATALOG["products"]
CUTOUT_MANIFEST = ROOT / "shop_cutouts.json"
CUTOUTS = json.loads(CUTOUT_MANIFEST.read_text()) if CUTOUT_MANIFEST.is_file() else {}
INSTAGRAM = "https://www.instagram.com/infimalega/"
EMAIL = "mailto:infimalega@gmail.com"
SHOP_STYLES = ("portfolio.css", "shop-archive.css?v=two-up")
STATUS_LABELS = {"Available": "Disponibile", "Archived": "Archiviato"}
MENU = [
    ("Infimalega", "index.html", "home"),
    ("Serie", "serie.html", "serie"),
    ("Archivio", "archivio.html", "archivio"),
    ("Contatti", "contatti.html", "contatti"),
    ("Archive", "shop.html", "shop"),
]
COVERS = {"street-study": 3, "amore-tossico": 9, "insecto": 7}
COLLECTION_TITLES = {
    "amore-tossico": "AMORE TOSSICO",
    "street-study": "/Street Study",
    "cuvee-semaine": "(Cuvée Semaine)",
    "insecto": "insecto",
}
EDITORIAL_PLACEHOLDERS = {
    "intro": "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
    "end": "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
}


def menu(current):
    links = []
    for name, href, key in MENU:
        selected = ' aria-current="page"' if key == current else ""
        links.append(f'<a href="{href}"{selected}>{name}</a>')
    return '<nav aria-label="Principale">' + '<span aria-hidden="true">·</span>'.join(links) + "</nav>"


def legacy_header(current):
    return f'''<header><a class="site-mark" href="index.html" aria-label="Infimalega, torna alla home">
  <img draggable="false" src="media/portfolio/croce.png" alt="" width="280" height="279">
</a>{menu(current)}</header>'''


def document(name, title, class_name, content, *, styles=("site.css",), script=None, favicon=None, theme_color="#000000"):
    page_title = "Infimalega" if title == "Infimalega" else title + " · Infimalega"
    icon = f'<link rel="icon" type="image/png" href="{favicon}">\n' if favicon else ""
    css = "\n".join(f'<link rel="stylesheet" href="{source}">' for source in styles)
    js = f'<script src="{script}" defer></script>' if script else ""
    (OUTPUT / name).write_text(f"""<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="{theme_color}">
<title>{escape(page_title)}</title>
{icon}{css}
<script src="media-guard.js" defer></script>
<script src="logo-3d.js?v=medium-8s" defer></script>
{js}
</head>
<body class="{class_name}">
{content}
</body>
</html>
""")


def photo(src, label, eager=False):
    loading = "" if eager else ' loading="lazy"'
    return f'<img draggable="false" src="{escape(src)}" alt="{escape(label)}"{loading}>'


def product_href(record):
    return record["id"].lower() + ".html"


def shop_photo(frame):
    return CUTOUTS.get(frame["src"], frame)


def shop_frames(record):
    return [shop_photo(frame) for frame in (record.get("statusPhotos") or [{"src": record["src"]}])]


panels = []
for entry in SERIES:
    src = entry["photos"][COVERS[entry["id"]]]["src"]
    href = entry["id"] + ".html"
    name = escape(entry["name"])
    panels.append(f"""<figure>
  <a href="{href}">{photo(src, name, eager=True)}</a>
  <figcaption><a href="{href}">{name}</a></figcaption>
</figure>""")

document("serie.html", "Serie", "series", f"""
{legacy_header("serie")}
<main>
  <h1 class="visually-hidden">Serie</h1>
  <div class="triptych">
    {''.join(panels)}
  </div>
</main>""")


def portfolio_header(*, shop_current=False):
    current = ' aria-current="page"' if shop_current else ""
    return f"""<header class="site-header">
  <a class="site-mark" href="index.html" aria-label="Infimalega, torna alla home">
    <img draggable="false" src="media/portfolio/croce.png" alt="" width="280" height="279">
  </a>
  <nav class="site-nav" aria-label="Navigazione principale">
    <a href="shop.html"{current}>Archive</a>
    <a href="about.html">About</a>
    <a href="index.html#contatti">Contatti</a>
  </nav>
</header>"""

EDITORIAL_BACK = '<a class="editorial-back" href="index.html#collezioni"><span aria-hidden="true">←</span> Collezioni</a>'

document("about.html", "About", "about-document", """
<header class="site-header">
  <a class="site-mark" href="index.html" aria-label="Infimalega, torna alla home">
    <img draggable="false" src="media/portfolio/croce.png" alt="" width="280" height="279">
  </a>
</header>
<main class="about-page" aria-labelledby="about-title">
  <section class="about-frame" tabindex="0" lang="en" aria-labelledby="about-title">
    <div class="about-sheet">
      <div class="about-print" aria-hidden="true">
        <img src="media/portfolio/footer-etichetta.webp" alt="" width="384" height="245" draggable="false">
      </div>
      <h1 id="about-title">INFIMALEGA</h1>
      <pre>
       |PROJECT|   2024, Naples

    Experimental fashion project
        exploring anti-fashion aesthetics
      and the garment as a one-of-one object.

             1|1 PRODUCTION                        ARCHIVE

           Unique pieces become part
      of a growing archive.


                     STORYTELLING
        Editorials, small independent fashion shows
   and digital communication.

              Fashion, underground culture
                    and visual identity.
</pre>
    </div>
  </section>
</main>""", styles=("portfolio.css?v=mobile-balance", "about.css?v=goodtimes"), favicon="media/portfolio/croce.png", theme_color="#007100")

PHOTO_VIEWER = """<dialog class="viewer" aria-labelledby="viewer-title">
  <div class="viewer-toolbar">
    <p id="viewer-title"></p>
    <button class="viewer-close" type="button" aria-label="Chiudi foto">×</button>
  </div>
  <div class="viewer-stage">
    <button class="viewer-prev" type="button" aria-label="Foto precedente">←</button>
    <img id="viewer-image" alt="" draggable="false">
    <button class="viewer-next" type="button" aria-label="Foto successiva">→</button>
  </div>
</dialog>"""

def collection_film(anchor, asset, label, width, height):
    return f"""<figure id="{escape(anchor)}" class="collection-film" style="--film-ratio: {width} / {height}">
    <video autoplay muted loop playsinline disablepictureinpicture disableremoteplayback controlslist="nodownload nofullscreen noremoteplayback" draggable="false" preload="none" poster="{escape(asset)}.jpg" width="{width}" height="{height}" aria-label="{escape(label)}">
      <source src="{escape(asset)}.mp4" type="video/mp4">
    </video>
  </figure>"""


def editorial_grid(kind, frames):
    photos = []
    for index, frame in enumerate(frames):
        src = escape(frame["src"])
        alt = escape(frame["alt"])
        width, height = int(frame["width"]), int(frame["height"])
        loading = "eager" if kind == "opening" and index == 0 else "lazy"
        anchor = ' id="look-6"' if Path(frame["src"]).name == "amore-02.webp" else ""
        photos.append(f"""    <a href="{src}" data-photo{anchor}>
      <img draggable="false" src="{src}" alt="{alt}" width="{width}" height="{height}" loading="{loading}" decoding="async">
    </a>""")
    links = "\n".join(photos)
    return f"""<div class="editorial-grid editorial-grid--{kind}">
{links}
  </div>"""


def editorial_lookbook(looks):
    strips = []
    for index, look in enumerate(looks, start=1):
        label = f"Outfit {index:02}"
        description = escape(look["description"])
        photo_count = len(look["photos"])
        frames = []
        for number, photo in enumerate(look["photos"], start=1):
            preview = f"media/lookbook/thumb/{Path(photo).name}"
            src = escape(preview if (OUTPUT / preview).is_file() else photo)
            frames.append(f"""        <a href="{escape(photo)}" data-photo>
          <img draggable="false" src="{src}" alt="{description}, foto {number} di {photo_count}" width="240" height="300" loading="lazy" decoding="async">
        </a>""")
        frame_links = "\n".join(frames)
        strips.append(f"""    <figure class="lookbook-strip" data-gallery aria-label="{label}">
      <div class="lookbook-frames">
{frame_links}
      </div>
      <figcaption>{label}</figcaption>
    </figure>""")
    strips_html = "\n".join(strips)
    return f"""
  <section id="lookbook" class="lookbook" aria-labelledby="lookbook-title">
    <h2 id="lookbook-title">Lookbook</h2>
    <div class="lookbook-grid">
{strips_html}
    </div>
  </section>"""


def editorial_copy(entry, position):
    paragraphs = entry.get("copy", {}).get(position)
    class_name = "editorial-copy editorial-copy--end" if position == "end" else "editorial-copy"
    if not paragraphs:
        placeholder = EDITORIAL_PLACEHOLDERS[position]
        return f'<p class="{class_name}" lang="la">{placeholder}</p>'

    content = "\n".join(f"    <p>{escape(paragraph)}</p>" for paragraph in paragraphs)
    return f'<div class="{class_name}" lang="en">\n{content}\n  </div>'


def editorial_page(entry, next_entry):
    title = escape(entry["title"])
    slug = escape(entry["id"])
    heading = escape(COLLECTION_TITLES.get(entry["id"], entry["title"]))
    year = f'\n    <p class="editorial-year">{int(entry["year"])}</p>' if entry.get("year") else ""
    looks = entry.get("lookbook", [])
    lookbook = editorial_lookbook(looks) if looks else ""
    lookbook_link = '<a class="editorial-back" href="#lookbook">Lookbook <span aria-hidden="true">↓</span></a>' if looks else ""
    film = entry.get("film")
    opening_film = ""
    if film:
        opening_film = "\n  " + collection_film(
            f"{slug}-film", film["asset"], f"Video della collezione {entry['title']}",
            int(film["width"]), int(film["height"]),
        )
    runway = ""
    if entry.get("runway"):
        runway_film = ""
        if slug == "amore-tossico":
            runway_film = "    " + collection_film(
                "amore-film", "media/portfolio/amore-tossico-film",
                "Amore Tossico — A Short Story", 1280, 720,
            ) + "\n"
        runway = f"""
  <section class="editorial-runway" aria-labelledby="runway-label">
{runway_film}    <label id="runway-label" class="visually-hidden" for="runway-title">Sfilata</label>
    <select id="runway-title" class="runway-menu">
      <option>Sfilata</option>
      <option>sfiLaTA</option>
      <option>SFILATA</option>
      <option>SfiLAlta</option>
      <option>sfILaTa</option>
    </select>
    {editorial_grid("runway", entry["runway"])}
  </section>"""

    next_link = ""
    if next_entry:
        next_title = escape(next_entry["title"])
        next_href = escape(next_entry["id"]) + ".html"
        next_link = f'\n  <a class="editorial-next" href="{next_href}">{next_title} <span aria-hidden="true">→</span></a>'

    return f"""
{portfolio_header()}
<main class="editorial editorial--{slug}" aria-label="{title}">
  <div class="editorial-heading">
    <div class="editorial-nav">{EDITORIAL_BACK}{lookbook_link}</div>
    <h1 id="editorial-title" class="editorial-title">{heading}</h1>{year}
  </div>
  <div role="group" data-gallery aria-label="{title}">
  {editorial_grid("opening", entry["opening"])}{opening_film}
  {editorial_copy(entry, "intro")}
  {editorial_grid("sequence", entry["sequence"])}
  {editorial_copy(entry, "end")}
  {editorial_grid("ending", entry["ending"])}{runway}
  </div>{lookbook}
  <div class="editorial-archive-callout">
    <a href="shop.html">Vai all’archivio</a>
  </div>
</main>
<footer class="editorial-footer">
  {EDITORIAL_BACK}{next_link}
</footer>
{PHOTO_VIEWER}"""


for index, entry in enumerate(EDITORIAL):
    next_entry = EDITORIAL[index + 1] if index + 1 < len(EDITORIAL) else None
    document(
        entry["id"] + ".html",
        entry["title"],
        "editorial-page",
        editorial_page(entry, next_entry),
        styles=("portfolio.css?v=plain", "editorial.css?v=photo-cells"),
        script="portfolio.js",
    )

document("da-vicino.html", "Da vicino", "close-page", """
<a class="site-mark" href="index.html" aria-label="Infimalega, torna alla home">
  <img draggable="false" src="media/portfolio/croce.png" alt="" width="280" height="279">
</a>
<main class="close-poster">
  <div class="close-opening">
    <h1>Mi vedi ancora?<br>Dentro la cornice?</h1>
    <fieldset aria-label="Mi vedi ancora?">
      <label>Sì <input type="radio" name="vedi" value="si"></label>
      <label>No <input type="radio" name="vedi" value="no"></label>
    </fieldset>
    <label for="close-break">Segui il ritratto<br>mentre scivola.<br>Dove lo perdi?</label>
    <input id="close-break" type="text" size="26" autocomplete="off">
  </div>

  <a class="close-corner close-replay" href="da-vicino.html">Rifai la<br>scansione</a>
  <a class="close-corner close-original" href="media/amore-tossico-17.webp">La foto<br>intera</a>

  <form class="close-reply" action="amore-tossico.html#look-6" autocomplete="off">
    <label for="close-answer">La cornice è ancora lì.<br>Che cosa rimane<br>quando sparisce?<br>Scrivilo qui.</label>
    <textarea id="close-answer" rows="3" cols="25"></textarea>
    <label class="close-field">nome <input type="text" size="20"></label>
    <label class="close-field">email <input type="email" size="20"></label>
    <p>Continua con<br>Amore Tossico</p>
    <button type="submit">ENTRA</button>
  </form>

  <a class="close-back" href="amore-tossico.html#look-6">
    <img draggable="false" src="media/amore-tossico-17.webp" alt="" width="38" height="36">
    <img draggable="false" src="media/amore-tossico-16.webp" alt="" width="38" height="36">
    Amore Tossico
  </a>
</main>""")

rows = []
for record in PRODUCTS:
    code = escape(record["id"])
    name = escape(record["name"])
    year = record["year"]
    materials = escape(record.get("detailMaterials") or record["materials"])
    terms = escape(" ".join([record["id"], record.get("detailId", ""), record["name"], record["materials"], record.get("detailMaterials", ""), record.get("series", "")]))
    rows.append(f'<tr data-year="{year}" data-terms="{terms}"><td>{code}</td><th scope="row"><a href="{product_href(record)}">{name}</a></th><td>{year}</td><td>{materials}</td></tr>')

years = "".join(f'<option>{year}</option>' for year in sorted({p["year"] for p in PRODUCTS}, reverse=True))
document("archivio.html", "Archivio", "archive", f"""
{legacy_header("archivio")}
<main class="archive-content">
  <h1>Archivio</h1>
  <form id="archive-filter" role="search" hidden>
    <label>Cerca <input type="search" name="query"></label>
    <label>Anno <select name="year"><option value="">Tutti</option>{years}</select></label>
  </form>
  <table>
    <thead><tr><th scope="col">Codice</th><th scope="col">Capo</th><th scope="col">Anno</th><th scope="col">Materiali</th></tr></thead>
    <tbody>{''.join(rows)}</tbody>
  </table>
  <p id="empty" hidden>Nessun risultato.</p>
</main>""", script="pages.js")

def shop_card(record):
    code = escape(record["id"])
    name = escape(record["name"])
    href = escape(product_href(record))
    year = escape(str(record["year"]))
    status = record["status"]
    status_text = escape(STATUS_LABELS.get(status, status))
    cover = shop_photo({"src": record["src"]})
    frames = shop_frames(record)
    alternate = ""
    if len(frames) > 1:
        alternate_src = escape(frames[1]["src"])
        alternate = f'\n      <img class="shop-card-alternate" draggable="false" src="{alternate_src}" alt="" loading="lazy" decoding="async">'
    photo_class = " shop-card-photo--swap" if alternate else ""
    return f"""<article class="shop-card" id="{code.lower()}">
  <a class="shop-card-preview" href="{href}" aria-label="Apri la scheda di {name}">
    <figure class="shop-card-photo{photo_class}">
      <img class="shop-card-cover" draggable="false" src="{escape(cover["src"])}" alt="" loading="lazy" decoding="async">{alternate}
    </figure>
  </a>
  <div class="shop-card-info">
    <p class="shop-code">{code} <span aria-hidden="true">·</span> {year}</p>
    <h2><a class="shop-card-link" href="{href}">{name}</a></h2>
    <p class="shop-status" data-status="{escape(status.lower())}">{status_text}</p>
  </div>
</article>"""


def shop_item(record):
    code = escape(record["id"])
    name = escape(record["name"])
    status = record["status"]
    fields = [
        ("Anno", record["year"]),
        ("Serie", record.get("series") or "Unassigned"),
        ("Materiali", record.get("detailMaterials") or record["materials"]),
        ("Origine", record.get("origin")),
        ("Stato", STATUS_LABELS.get(status, status)),
    ]
    facts = "\n".join(f'      <dt>{label}</dt><dd>{escape(str(value))}</dd>' for label, value in fields if value)

    images = []
    for index, frame in enumerate(shop_frames(record), start=1):
        src = escape(frame["src"])
        alt = f"{name}, foto {index}"
        dimensions = ""
        if frame.get("width") and frame.get("height"):
            dimensions = f' width="{int(frame["width"])}" height="{int(frame["height"])}"'
        loading = ' loading="lazy"' if index > 1 else ""
        images.append(f'    <a href="{src}" data-photo><img draggable="false" src="{src}" alt="{alt}"{dimensions}{loading} decoding="async"></a>')
    photos = "\n".join(images)

    return f"""
{portfolio_header()}
<main class="shop-content shop-item">
  <div class="shop-item-top">
    <header>
      <p class="shop-code">{code}</p>
      <h1 class="code-title--large">{name}</h1>
    </header>
    <dl class="shop-item-facts">
{facts}
    </dl>
  </div>
  <div class="shop-item-gallery" data-gallery aria-label="{name}">
{photos}
  </div>
  <nav class="shop-item-links" aria-label="Link del capo">
    <a href="shop.html#{code.lower()}"><span aria-hidden="true">←</span> Archive</a>
    <a href="index.html#contatti">Contattaci per questo capo</a>
  </nav>
</main>
{PHOTO_VIEWER}"""


cards = "\n".join(shop_card(record) for record in PRODUCTS)
document("shop.html", "Archive", "shop-page", f"""
{portfolio_header(shop_current=True)}
<main class="shop-content">
  <header class="shop-heading">
    <h1 class="code-title--large">Archive</h1>
  </header>
  <div class="shop-grid">
{cards}
  </div>
</main>""", styles=SHOP_STYLES, favicon="media/portfolio/croce.png", theme_color="#ffffff")

for record in PRODUCTS:
    document(
        product_href(record),
        record["name"],
        "shop-page",
        shop_item(record),
        styles=SHOP_STYLES,
        script="portfolio.js",
        favicon="media/portfolio/croce.png",
        theme_color="#ffffff",
    )

document("contatti.html", "Contatti", "contact", f"""
{legacy_header("contatti")}
<main>
  <h1>Contatti</h1>
  <address>
    Infimalega<br>
    Napoli, Italia<br>
    <a href="{EMAIL}">infimalega@gmail.com</a><br>
    <a href="{INSTAGRAM}">Instagram</a>
  </address>
</main>""")
