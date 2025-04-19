import { useState, useEffect, useRef } from 'react';
import './App.css';

// Mock conversation data
const initialMockMessages = [
  { role: 'user', content: 'Hello Llama!' },
  { role: 'assistant', content: 'Hello! How can I help you today?' },
  { role: 'user', content: 'Can you explain what a large language model is?' },
  { role: 'assistant', content: 'A large language model (LLM) is a type of artificial intelligence algorithm that uses deep learning techniques and massively large data sets to understand, summarize, generate, and predict new content.' },
  { role: 'user', content: 'That makes sense. What are some examples?' },
  { role: 'assistant', content: 'Examples include models like me (Llama), GPT-4, Gemini, Claude, and others. They power applications like chatbots, content generation tools, and translation services.' },
  { role: 'user', content: 'Interesting. How do they learn?' },
  { role: 'assistant', content: 'They learn by being trained on vast amounts of text data from the internet and books. During training, they learn patterns, grammar, facts, and reasoning abilities.' },
  { role: 'user', content: 'Thanks for the explanation!' },
  { role: 'assistant', content: 'You\'re welcome! Is there anything else I can help you with?' },
];

function App() {
  const [userInput, setUserInput] = useState('');
  const [messages, setMessages] = useState(initialMockMessages); // Stores messages for the current chat { role: 'user' | 'assistant', content: string }
  const [conversations, setConversations] = useState([]); // Stores past conversation summaries/IDs for the sidebar
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Placeholder for loading conversations history (e.g., from localStorage)
  useEffect(() => {
    // Example: Load conversations if needed
    // const savedConversations = localStorage.getItem('conversations');
    // if (savedConversations) {
    //   setConversations(JSON.parse(savedConversations));
    // }
    // For now, add a default new chat
    if (conversations.length === 0) {
      setConversations([{ id: Date.now(), title: 'New Chat' }]);
    }
  }, [conversations]); // Runs only once on mount

  const handleInputChange = (event) => {
    setUserInput(event.target.value);
  };

  const handleSendMessage = async (event) => {
    event.preventDefault();
    if (!userInput.trim() || isLoading) return;

    const newUserMessage = { role: 'user', content: userInput };
    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);
    const currentInput = userInput; // Capture userInput before clearing
    setUserInput('');
    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama3.2', // Or your preferred model
          messages: updatedMessages,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Process streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let assistantResponse = { role: 'assistant', content: '' };
      let responseAdded = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          try {
            const parsedLine = JSON.parse(line);

            if (!responseAdded) {
              setMessages(prev => [...prev, assistantResponse]);
              responseAdded = true;
            }

            if (parsedLine.message && parsedLine.message.content) {
              assistantResponse.content += parsedLine.message.content;
              setMessages(prev => [
                ...prev.slice(0, -1),
                { ...assistantResponse }
              ]);
            }

            if (parsedLine.done) {
              break;
            }
          } catch (error) {
            console.error('Error parsing JSON from stream:', error, line);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching Ollama:', error);
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${error.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Placeholder function to switch conversations
  const handleSelectConversation = (id) => {
    console.log("Switching to conversation:", id);
    // In a real app, you would load the messages for the selected conversation ID
    // setMessages(loadedMessages);
    // For now, just clear messages for demo
    setMessages([]);
  };

  // Placeholder function to start a new chat
  const handleNewChat = () => {
    const newId = Date.now();
    setConversations(prev => [...prev, { id: newId, title: `New Chat ${prev.length + 1}` }]);
    setMessages([]); // Start with empty messages
    // Optionally select the new chat immediately
    // handleSelectConversation(newId);
  };


  return (
    <div className="app-container">
      <aside className="sidebar">
        <h2>Diary Entries</h2>
        <button onClick={handleNewChat} className="new-chat-button">New Chat</button>
        <ul>
          {conversations.map((convo) => (
            <li key={convo.id} onClick={() => handleSelectConversation(convo.id)}>
              {convo.title}
            </li>
          ))}
        </ul>
      </aside>
      <main className="chat-window">
        <div className="messages-container">
          {messages.map((msg, index) => (
            <div key={index} className={`message-row ${msg.role}`}>
              <div className={`message-bubble ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                {msg.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="message-row assistant">
              <div className="message-bubble thinking">
                <span className="dot"></span>
                <span className="dot"></span>
                <span className="dot"></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <form onSubmit={handleSendMessage} className="chat-input-form">
          <input
            type="text"
            value={userInput}
            onChange={handleInputChange}
            placeholder="Talk to Llama..."
            disabled={isLoading}
          />
          <button type="submit" disabled={isLoading}>Send</button>
        </form>
      </main>
    </div>
  );
}

export default App;
