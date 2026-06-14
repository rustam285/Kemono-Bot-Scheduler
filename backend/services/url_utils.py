from __future__ import annotations

import re
from urllib.parse import urlparse, urlunparse


def normalize_url(url: str) -> str:
    url = url.strip()
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    parsed = urlparse(url)

    scheme = parsed.scheme.lower()
    netloc = parsed.netloc.lower().rstrip(".")
    path = parsed.path.rstrip("/") or "/"

    drop_params = {"utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
                   "ref", "fbclid", "gclid", "mc_cid", "mc_eid"}
    query_parts = []
    for param in parsed.query.split("&"):
        if not param:
            continue
        key = param.split("=", 1)[0].lower()
        if key not in drop_params:
            query_parts.append(param)
    query = "&".join(query_parts)

    return urlunparse((scheme, netloc, path, "", query, ""))
