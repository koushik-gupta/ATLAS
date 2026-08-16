from src.utils.helpers import parse_rating

def test_parse_rating_standard_10_scale():
    """Test that a normal 10-scale rating is returned exactly as is."""
    result = parse_rating("8.5")
    assert result == 8.5

def test_parse_rating_5_scale_doubling():
    """Test that a 5-scale rating (like 4.5/5) is correctly doubled to a 10-scale (9.0)."""
    result = parse_rating("4.5/5")
    assert result == 9.0

def test_parse_rating_out_of_text():
    """Test that text like '4.7 out of 5' is handled correctly."""
    result = parse_rating("4.7 out of 5")
    assert result == 9.4

def test_parse_rating_invalid_input():
    """Test that garbage input returns the default value (5.0)."""
    result = parse_rating("garbage_text")
    assert result == 5.0
