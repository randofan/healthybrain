import { useState, useEffect, useRef } from 'react';
import './App.css';

function getDate() {
  const currentDate = new Date();
  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
  const day = String(currentDate.getDate()).padStart(2, '0');

  const formattedDate = `${year}-${month}-${day}`;
  return formattedDate;
}

// Mock conversation data
const initialMockMessages = [
  { role: 'system', content: "You a living diary that asks them simple and brief questions about your user's day. Please inform the user that you are fully private and on-device. Today is " + getDate() + ". Begin asking the user about the events of their day."},
];

function App() {
  const [userInput, setUserInput] = useState('');
  const [messages, setMessages] = useState([]); // Initialize with empty array instead of mock messages
  const [conversations, setConversations] = useState([]); // Stores past conversation summaries/IDs for the sidebar
  const [isLoading, setIsLoading] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load conversations from localStorage
  useEffect(() => {
    const savedConversations = localStorage.getItem('conversations');
    if (savedConversations) {
      const parsedConversations = JSON.parse(savedConversations);
      setConversations(parsedConversations);

      // Set the current conversation to the most recent one
      if (parsedConversations.length > 0) {
        const latestConvo = parsedConversations[parsedConversations.length - 1];
        setCurrentConversationId(latestConvo.id);

        // Load the messages for this conversation
        const savedMessages = localStorage.getItem(`messages-${latestConvo.id}`);
        if (savedMessages) {
          setMessages(JSON.parse(savedMessages));
        }
      }
    } else {
      // Create default conversation if none exists
      const newId = Date.now();
      const newConversations = [{ id: newId, title: 'New Chat' }];
      setConversations(newConversations);
      setCurrentConversationId(newId);
      localStorage.setItem('conversations', JSON.stringify(newConversations));
    }
  }, []); // Run only once on component mount

  // Save conversations whenever they change
  useEffect(() => {
    if (conversations.length > 0) {
      localStorage.setItem('conversations', JSON.stringify(conversations));
    }
  }, [conversations]);

  // Save messages whenever they change
  useEffect(() => {
    if (currentConversationId && messages.length > 0) {
      localStorage.setItem(`messages-${currentConversationId}`, JSON.stringify(messages));

      // Update conversation title based on first user message if title is generic
      if (messages.length >= 1 &&
        conversations.find(c => c.id === currentConversationId)?.title.startsWith('New Chat')) {
        const firstUserMessage = messages.find(m => m.role === 'user')?.content;
        if (firstUserMessage) {
          const shortTitle = firstUserMessage.substring(0, 30) + (firstUserMessage.length > 30 ? '...' : '');
          setConversations(prev =>
            prev.map(convo =>
              convo.id === currentConversationId ? { ...convo, title: shortTitle } : convo
            )
          );
        }
      }
    }
  }, [messages, currentConversationId, conversations]);

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

  // Function to switch conversations
  const handleSelectConversation = (id) => {
    // Save current messages before switching
    if (currentConversationId && messages.length > 0) {
      localStorage.setItem(`messages-${currentConversationId}`, JSON.stringify(messages));
    }

    // Load the selected conversation's messages
    const savedMessages = localStorage.getItem(`messages-${id}`);
    if (savedMessages) {
      setMessages(JSON.parse(savedMessages));
    } else {
      setMessages([]);
    }

    setCurrentConversationId(id);
  };

  // Function to start a new chat
  const handleNewChat = () => {
    // Save current conversation messages
    if (currentConversationId && messages.length > 0) {
      localStorage.setItem(`messages-${currentConversationId}`, JSON.stringify(messages));
    }

    const newId = Date.now();
    const newConvo = { id: newId, title: `New Chat` };
    setConversations(prev => [...prev, newConvo]);
    setMessages(initialMockMessages);
    setCurrentConversationId(newId);
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <h2>Diary Entries</h2>
        <button onClick={handleNewChat} className="new-chat-button">New Chat</button>
        <ul>
          {conversations.map((convo) => (
            <li
              key={convo.id}
              onClick={() => handleSelectConversation(convo.id)}
              className={convo.id === currentConversationId ? 'active' : ''}
            >
              {convo.title}
            </li>
          ))}
        </ul>
      </aside>
      <main className="chat-window">
        <div className="messages-container">
          {messages.filter((msg) => msg.role != 'system').map((msg, index) => (
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
