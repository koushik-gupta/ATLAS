from unittest.mock import patch, MagicMock
from src.tools.hotel_tool import hotel_search

@patch("src.tools.hotel_tool.DDGS")
@patch("src.tools.hotel_tool.get_structured_llm")
def test_hotel_search_tool_mocking(mock_get_llm, mock_ddgs):
    """
    This is an advanced mock. 
    Your hotel tool does TWO external things:
    1. It searches the internet using DuckDuckGo (DDGS).
    2. It calls the OpenAI/Groq LLM to parse the data (get_structured_llm).
    
    We have to mock BOTH of them so the test runs for free without the internet!
    """
    
    # 1. Mock the DuckDuckGo Internet Search
    # Because your code uses a 'with DDGS() as ddgs:' block, we have to mock the __enter__ method.
    mock_ddgs_instance = mock_ddgs.return_value.__enter__.return_value
    mock_ddgs_instance.text.return_value = [{"title": "Best Hotels", "body": "Paris Marriott is good."}]

    # 2. Mock the OpenAI/Groq LLM
    mock_llm_instance = MagicMock()
    
    # Create a fake Pydantic hotel object
    fake_parsed_hotel = MagicMock()
    fake_parsed_hotel.model_dump.return_value = {
        "name": "The Grand Mock Hotel",
        "price_per_night": "₹5000",
        "rating": "9.5/10",
        "address": "Downtown Paris"
    }
    
    # Put it in a fake response list
    fake_parsed_response = MagicMock()
    fake_parsed_response.results = [fake_parsed_hotel]
    
    # Tell the LLM to return our fake list when .invoke() is called
    mock_llm_instance.invoke.return_value = fake_parsed_response
    mock_get_llm.return_value = mock_llm_instance

    # 3. Call your actual LangChain tool
    # Note: LangChain tools are called using .invoke()
    result = hotel_search.invoke({"destination": "Paris"})

    # 4. Assertions
    assert len(result) == 1
    assert result[0]["name"] == "The Grand Mock Hotel"
    assert result[0]["rating"] == "9.5/10"
    
    # Prove that both mocks were actually called during the test!
    mock_ddgs_instance.text.assert_called_once()
    mock_llm_instance.invoke.assert_called_once()
