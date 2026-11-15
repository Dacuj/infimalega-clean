"""Import the original Infimalega Archive into catalog.json and dist/media.

Install dependencies: python3 -m pip install beautifulsoup4 Pillow
Update the catalog:   python3 import_shop_archive.py
Prepare cutouts:      node isolate_shop_archive.mjs (requires dwebp and cwebp)
Rebuild the site:     python3 build.py

If Python on macOS cannot find its trusted certificates, use
SSL_CERT_FILE=/etc/ssl/cert.pem python3 import_shop_archive.py
"""

from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import re
from tempfile import TemporaryDirectory
from time import sleep
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup
from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parent
CATALOG = ROOT / "catalog.json"
DIST = ROOT / "dist"
MEDIA = Path("media/shop-archive")
ORIGINAL = "https://www.infimalega.com"
ARCHIVE = f"{ORIGINAL}/archive"
MIRROR = "https://sites.google.com/view/infimalega"
SITE_IMAGE_HOSTS = {"sites.google.com", "lh7-us.googleusercontent.com"}
FIELDS = ("Year", "Series", "Materials", "Origin", "Status")


def fetch(url):
    request = Request(url, headers={"User-Agent": "Infimalega Archive Import"})
    for attempt in range(3):
        try:
            with urlopen(request, timeout=30) as response:
                return response.read()
        except HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise
        except (URLError, TimeoutError):
            if attempt == 2:
                raise
        sleep(2 ** attempt)


def page(url):
    return BeautifulSoup(fetch(url), "html.parser")


def tidy(text):
    return " ".join(text.split())


def title_and_year(heading):
    match = re.fullmatch(r"(.+?)\s*\(([\d\s]+)\)", tidy(heading.get_text()))
    if not match:
        raise ValueError(f"Missing product title/year: {heading.get_text()!r}")
    return match[1].strip(), int("".join(match[2].split()))


def archive_cards(base):
    cards = []
    for card in page(f"{base}/archive").select("section .HQwdzb"):
        link = next((a for a in card.select("a[href]") if tidy(a.get_text()).upper() == "STATUS"), None)
        if link is None:
            continue
        code, materials, *_ = card.select("li")
        identifier = "".join(code.get_text().split()).upper()
        slug = urlsplit(urljoin(f"{base}/archive", link["href"])).path.rsplit("/", 1)[-1]
        if not re.fullmatch(r"INF-\d+", identifier) or not re.fullmatch(r"inf-\d+", slug):
            raise ValueError(f"Unexpected product or Status link: {identifier}, {link['href']}")
        name, year = title_and_year(card.h2)
        cards.append({
            "id": identifier,
            "archiveName": name,
            "archiveYear": year,
            "materials": tidy(materials.get_text()),
            "source": f"{ARCHIVE}#{card.h2['id'].removesuffix('_l')}",
            "statusSource": f"{ORIGINAL}/{slug}",
            "detailUrl": f"{base}/{slug}",
            "coverUrl": card.img["src"],
        })
    if not cards or len({card["id"] for card in cards}) != len(cards):
        raise ValueError("Archive is empty or has duplicate product codes")
    return cards


def status_fields(section):
    fields = {}
    for paragraph in section.select("p"):
        # Google Sites separates field labels and values with a line break.
        for br in paragraph.select("br"):
            br.replace_with("\n")
        label, _, value = paragraph.get_text().partition("\n")
        if tidy(label) in FIELDS:
            fields[tidy(label)] = tidy(value)
    if missing := set(FIELDS) - {label for label, value in fields.items() if value}:
        raise ValueError(f"Missing fields: {', '.join(sorted(missing))}")
    return fields


def status_photos(section):
    slides = section.select(".mr3rhf .nQBJnb")
    if slides:
        return [re.search(r"url\(([^)]+)\)", slide["style"])[1].strip(" '\"") for slide in slides]
    return [img["src"] for img in section.select("img[src]")]


def save_photo(url, stem, size, staging):
    if urlsplit(url).scheme != "https" or urlsplit(url).hostname not in SITE_IMAGE_HOSTS:
        raise ValueError(f"Unexpected Google Sites image host: {urlsplit(url).netloc}")
    sized = re.sub(r"=w\d+[^/?]*$", "", url) + f"=w{size}"
    try:
        data = fetch(sized)
    except HTTPError as error:
        if sized == url or error.code not in (400, 403, 404):
            raise
        data = fetch(url)
    with Image.open(BytesIO(data)) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
        image.thumbnail((size, size), Image.Resampling.LANCZOS)
        output = BytesIO()
        image.save(output, "WEBP", quality=88, method=4)
    photo = output.getvalue()
    digest = sha256(photo).hexdigest()[:12]
    path = MEDIA / f"{stem}-{digest}.webp"
    (staging / path.name).write_bytes(photo)
    return {"src": path.as_posix(), "width": image.width, "height": image.height}


def import_product(card, staging):
    record = dict(card)
    section = page(record.pop("detailUrl")).select_one("main section:has(h2), section:has(h2)")
    if section is None:
        raise ValueError("Status page has no product section")
    name, title_year = title_and_year(section.h2)
    fields = status_fields(section)
    year = int("".join(fields["Year"].split()))
    if year != title_year:
        raise ValueError(f"Status title year {title_year} differs from Year {year}")
    photos = status_photos(section)
    if not photos:
        raise ValueError("Status page has no product photos")

    identifier = record["id"].lower()
    cover = save_photo(record.pop("coverUrl"), f"{identifier}-cover", 900, staging)
    purchase = next((a["href"] for a in section.select("a[href]") if tidy(a.get_text()) == "VIEW UNIT"), None)
    record.update({
        "name": name,
        "year": year,
        "series": fields["Series"],
        "detailMaterials": fields["Materials"],
        "origin": fields["Origin"],
        "status": fields["Status"],
        "shop": purchase,
        "src": cover["src"],
        "cover": cover,
        "statusPhotos": [
            save_photo(url, f"{identifier}-{index:02}", 1800, staging)
            for index, url in enumerate(photos, 1)
        ],
    })
    detail_code = record["statusSource"].rsplit("/", 1)[-1].upper()
    if detail_code != record["id"]:
        record["detailId"] = detail_code
    return record


def import_archive(base, staging):
    def import_card(card):
        try:
            return import_product(card, staging)
        except (OSError, ValueError, KeyError, AttributeError, IndexError, TypeError) as error:
            raise RuntimeError(f"{card['id']}: {error}") from error

    with ThreadPoolExecutor(max_workers=6) as workers:
        return list(workers.map(import_card, archive_cards(base)))


def main():
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    with TemporaryDirectory(prefix=".archive-import-", dir=ROOT) as directory:
        staging = Path(directory)
        try:
            products = import_archive(ORIGINAL, staging)
        except (HTTPError, URLError, RuntimeError) as error:
            print(f"Original host: {error}. Retrying via the Google Sites origin.", flush=True)
            products = import_archive(MIRROR, staging)
        catalog["products"] = products

        # Install the new files before swapping the catalog. An interrupted
        # download leaves the previous catalog and all its photos intact.
        target = DIST / MEDIA
        target.mkdir(parents=True, exist_ok=True)
        for product in products:
            for photo in [product["cover"], *product["statusPhotos"]]:
                filename = Path(photo["src"]).name
                (staging / filename).replace(target / filename)
        manifest = staging / CATALOG.name
        manifest.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        manifest.replace(CATALOG)

    photos = sum(len(product["statusPhotos"]) for product in products)
    print(f"Imported {len(products)} products, {len(products)} covers and {photos} Status photos.")


if __name__ == "__main__":
    main()
