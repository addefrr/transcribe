"""Guard against user-supplied URLs that point into private networks.

Resolution happens here and again inside yt-dlp/ffmpeg, so a DNS record that
changes between checks (or a redirect to a private address) can still slip
through; treat this as a strong first line, and run the worker in a network
segment with no reachable internal services for defense in depth.
"""
import ipaddress
import socket
from urllib.parse import urlparse

from . import config
from .errors import JobError


def check_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise JobError("Only http(s) URLs are supported.")
    host = parsed.hostname
    if not host:
        raise JobError("URL has no host.")
    if config.SSRF_ALLOW_PRIVATE:
        return
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        raise JobError(f"Could not resolve host {host!r}.")
    for _family, _type, _proto, _canon, sockaddr in infos:
        ip = ipaddress.ip_address(sockaddr[0])
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            raise JobError("URL resolves to a private or reserved network address.")
