"""Public crawl requests tolerate broken certificates without hiding other failures."""

import ssl
from email.message import Message
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError, URLError
from urllib.request import Request

import pytest

from jobpulse_scraper.network import http_client


def test_default_tls_verifies_certificate_and_hostname():
    context = http_client.get_ssl_context()
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname


def test_declared_waf_challenge_stops_http_requests_and_keeps_observed_status():
    from jobpulse_scraper.network.experience import run_metrics
    from jobpulse_scraper.network.request_policy import ContentChallenge, HostCoolingDown

    response = MagicMock()
    response.status = 202
    response.headers = Message()
    response.headers["x-amzn-waf-action"] = "challenge"
    response.geturl.return_value = "https://synthetic.invalid/jobs"
    with patch.object(http_client, "_stdlib_urlopen", return_value=response) as fetch:
        with pytest.raises(ContentChallenge) as error:
            with http_client.open_request(Request("https://synthetic.invalid/jobs")):
                raise AssertionError("A challenge must not be passed to a job parser")
        assert error.value.status == 202
        with pytest.raises(HostCoolingDown):
            with http_client.open_request(Request("https://synthetic.invalid/next")):
                pass
        assert fetch.call_count == 1
    response.close.assert_called_once()
    measured = run_metrics("", 1)
    assert measured["requests_sent"] == measured["responses"] == measured["denials"] == 1
    assert measured["hosts"][0]["latest_denial"]["status"] == 202
    assert measured["hosts"][0]["latest_denial"]["content_challenge"] is True


def test_ordinary_202_response_is_not_invented_as_a_challenge():
    response = MagicMock()
    response.status = 202
    response.headers = Message()
    with patch.object(http_client, "_stdlib_urlopen", return_value=response):
        with http_client.open_request(Request("https://synthetic.invalid")) as actual:
            assert actual is response


def test_declared_captcha_error_keeps_real_status_and_does_not_retry():
    from jobpulse_scraper.network.experience import run_metrics
    from jobpulse_scraper.network.request_policy import ContentChallenge

    headers = Message()
    headers["x-amzn-waf-action"] = "captcha"
    failure = HTTPError("https://synthetic.invalid", 405, "Synthetic CAPTCHA", headers, None)
    with patch.object(http_client, "_stdlib_urlopen", side_effect=failure) as fetch:
        with pytest.raises(ContentChallenge) as caught:
            with http_client.open_request(Request("https://synthetic.invalid")):
                pass
    assert fetch.call_count == 1
    assert caught.value.status == 405
    metrics = run_metrics("", 1)
    assert metrics["denials"] == metrics["responses"] == 1
    assert metrics["hosts"][0]["latest_denial"]["status"] == 405


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


def test_wire_encoding_preserves_identity_and_existing_escapes():
    from jobpulse_scraper.network.http_client import wire_url

    url = "https://example.invalid/spec/Engineer Booklet%20(final).pdf?reference=role 1&encoded=%2F"
    assert (
        wire_url(url) == "https://example.invalid/spec/Engineer%20Booklet%20(final).pdf?reference=role%201&encoded=%2F"
    )
    assert "Engineer Booklet" in url


def test_public_stream_budget_is_cumulative(monkeypatch):
    import io

    import pytest

    from jobpulse_scraper.contracts import ResponseBudgetExceeded
    from jobpulse_scraper.network import http_client

    monkeypatch.setattr(http_client, "MAX_RESPONSE_BYTES", 5)
    response = http_client.BoundedResponse(io.BytesIO(b"123456"))
    assert response.read(3) == b"123"
    with pytest.raises(ResponseBudgetExceeded):
        response.read(3)


def test_decompression_budget_rejects_small_compressed_expansion(monkeypatch):
    import gzip
    import io

    import pytest

    from jobpulse_scraper.contracts import ResponseBudgetExceeded
    from jobpulse_scraper.network import transport

    monkeypatch.setattr(transport, "MAX_RESPONSE_BYTES", 100)

    class Response(io.BytesIO):
        headers = {"Content-Encoding": "gzip"}

    with pytest.raises(ResponseBudgetExceeded):
        transport.bounded_body(Response(gzip.compress(b"x" * 101)))
