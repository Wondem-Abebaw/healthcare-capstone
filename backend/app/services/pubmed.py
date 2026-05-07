"""
PubMed service — searches NCBI PubMed for medical literature.
Uses the E-utilities API (free, no key required for basic usage).
"""
import httpx
import asyncio
import structlog
from xml.etree import ElementTree as ET

log = structlog.get_logger()

EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
DEFAULT_RETMAX = 10


async def search_pubmed(query: str, max_results: int = DEFAULT_RETMAX) -> list[dict]:
    """
    Search PubMed and return article abstracts.
    Returns list of {pmid, title, abstract, authors, journal, year, url}
    """
    async with httpx.AsyncClient(timeout=30) as client:
        # Step 1: esearch — get PMIDs
        search_resp = await client.get(
            f"{EUTILS_BASE}/esearch.fcgi",
            params={
                "db": "pubmed",
                "term": query,
                "retmax": max_results,
                "retmode": "json",
                "sort": "relevance",
            },
        )
        search_resp.raise_for_status()
        pmids = search_resp.json().get("esearchresult", {}).get("idlist", [])

        if not pmids:
            log.info("pubmed.no_results", query=query)
            return []

        # Step 2: efetch — get full abstracts
        fetch_resp = await client.post(
            f"{EUTILS_BASE}/efetch.fcgi",
            data={
                "db": "pubmed",
                "id": ",".join(pmids),
                "rettype": "abstract",
                "retmode": "xml",
            },
        )
        fetch_resp.raise_for_status()

        articles = _parse_pubmed_xml(fetch_resp.text)
        log.info("pubmed.results", query=query, count=len(articles))
        return articles


def _parse_pubmed_xml(xml_text: str) -> list[dict]:
    """Parse PubMed XML response into structured dicts."""
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return []

    articles = []
    for article_node in root.findall(".//PubmedArticle"):
        try:
            medline = article_node.find("MedlineCitation")
            article = medline.find("Article")

            pmid = medline.findtext("PMID", "")
            title = article.findtext("ArticleTitle", "")

            # Abstract text (may have multiple AbstractText nodes with labels)
            abstract_parts = []
            abstract_node = article.find("Abstract")
            if abstract_node is not None:
                for at in abstract_node.findall("AbstractText"):
                    label = at.get("Label")
                    text = at.text or ""
                    if label:
                        abstract_parts.append(f"{label}: {text}")
                    else:
                        abstract_parts.append(text)
            abstract = " ".join(abstract_parts)

            # Authors
            authors = []
            author_list = article.find("AuthorList")
            if author_list is not None:
                for author in author_list.findall("Author"):
                    last = author.findtext("LastName", "")
                    fore = author.findtext("ForeName", "")
                    if last:
                        authors.append(f"{last} {fore}".strip())

            # Journal + Year
            journal = article.findtext(".//Journal/Title", "")
            year = article.findtext(
                ".//Journal/JournalIssue/PubDate/Year", ""
            ) or article.findtext(".//PubDate/MedlineDate", "")[:4]

            articles.append(
                {
                    "pmid": pmid,
                    "title": title,
                    "abstract": abstract,
                    "authors": authors[:5],  # cap at 5
                    "journal": journal,
                    "year": year,
                    "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
                }
            )
        except Exception as exc:
            log.warning("pubmed.parse_error", exc=str(exc))
            continue

    return articles


async def search_drug_interactions(drug_a: str, drug_b: str) -> list[dict]:
    """Convenience wrapper for drug interaction searches."""
    query = f'"{drug_a}" AND "{drug_b}" AND (interaction OR adverse) AND humans[MeSH]'
    return await search_pubmed(query, max_results=5)


async def search_condition(condition: str, evidence_type: str = "systematic review") -> list[dict]:
    """Search for clinical evidence on a condition."""
    query = f'"{condition}" AND "{evidence_type}"[Publication Type] AND humans[MeSH]'
    return await search_pubmed(query, max_results=8)
