"""Public crawl requests tolerate broken certificates without hiding other failures."""

import ssl
from email.message import Message
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError, URLError
from urllib.request import Request

import pytest

from network import http_client


def test_default_tls_verifies_certificate_and_hostname():
    context = http_client.get_ssl_context()
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname


@pytest.mark.parametrize("wrapped", [False, True])
@pytest.mark.parametrize("method", ["GET", "POST"])
def test_certificate_failure_retries_request_without_verification(wrapped, method):
    error = ssl.SSLCertVerificationError("hostname mismatch")
    failure = URLError(error) if wrapped else error
    response = MagicMock()
    request = Request("https://example.invalid", data=b"{}" if method == "POST" else None, method=method)
    with patch.object(http_client, "_stdlib_urlopen", side_effect=[failure, response]) as fetch:
        with http_client.open_request(request, timeout=7) as result:
            assert result is response
    assert fetch.call_count == 2
    first, retry = fetch.call_args_list
    assert first.args[0] is request and retry.args[0] is request
    assert first.kwargs["context"].verify_mode == ssl.CERT_REQUIRED
    assert first.kwargs["context"].check_hostname
    assert retry.kwargs["context"].verify_mode == ssl.CERT_NONE
    assert not retry.kwargs["context"].check_hostname
    assert retry.kwargs["timeout"] == 7
    response.close.assert_called_once()


@pytest.mark.parametrize("reason", ["connection refused", ssl.SSLError("protocol failure")])
def test_other_connection_errors_do_not_disable_verification(reason):
    with patch.object(http_client, "_stdlib_urlopen", side_effect=URLError(reason)) as fetch:
        with pytest.raises(URLError):
            with http_client.open_request(Request("https://example.invalid")):
                pass
    assert fetch.call_count == 1


def test_page_certificate_fallback_preserves_final_url_and_content():
    response = MagicMock()
    response.__enter__.return_value = response
    response.geturl.return_value = "https://example.invalid/jobs"
    response.read.return_value = b"jobs"
    response.info.return_value = {}
    with patch.object(
        http_client, "_stdlib_urlopen", side_effect=[URLError(ssl.SSLCertVerificationError()), response]
    ) as fetch:
        assert http_client.fetch_url_with_final("https://example.invalid") == ("https://example.invalid/jobs", "jobs")
    assert fetch.call_count == 2


def test_failed_certificate_fallback_propagates():
    failure = URLError("connection refused")
    with patch.object(
        http_client, "_stdlib_urlopen", side_effect=[URLError(ssl.SSLCertVerificationError()), failure]
    ) as fetch:
        with pytest.raises(URLError) as caught:
            http_client.fetch_page("https://example.invalid")
    assert caught.value is failure
    assert fetch.call_count == 2


def test_http_error_does_not_trigger_certificate_fallback():
    error = HTTPError("https://example.invalid", 403, "Forbidden", Message(), None)
    with patch.object(http_client, "_stdlib_urlopen", side_effect=error) as fetch:
        with pytest.raises(HTTPError):
            with http_client.open_request(Request("https://example.invalid")):
                pass
    assert fetch.call_count == 1
