import { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  const [userInput, setUserInput] = useState('');
  const [messages, setMessages] = useState([]); // Stores messages for the current chat { role: 'user' | 'assistant', content: string }
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
  }, []); // Runs only once on mount

  const handleInputChange = (event) => {
    setUserInput(event.target.value);
  };

  const handleSendMessage = async (event) => {
    event.preventDefault();
    if (!userInput.trim() || isLoading) return;

    const newUserMessage = { role: 'user', content: userInput };
    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);
    setUserInput('');
    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama3', // Or your preferred model
          messages: updatedMessages,
          stream: true,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantResponse = '';
      let firstChunk = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        // Ollama streams NDJSON (Newline Delimited JSON)
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.message && parsed.message.content) {
              assistantResponse += parsed.message.content;
              if (firstChunk) {
                 // Add the assistant message object on the first chunk
                 setMessages(prev => [...prev, { role: 'assistant', content: assistantResponse }]);
                 firstChunk = false;
              } else {
                 // Update the content of the last message (assistant's)
                 setMessages(prev => {
                   const lastMsgIndex = prev.length - 1;
                   if (lastMsgIndex >= 0 && prev[lastMsgIndex].role === 'assistant') {
                     const updated = [...prev];
                     updated[lastMsgIndex] = { ...updated[lastMsgIndex], content: assistantResponse };
                     return updated;
                   }
                   return prev; // Should not happen if firstChunk logic is correct
                 });
              }
            }
            if (parsed.done) {
                // Optional: Handle end of stream if needed, e.g., save conversation
                // if (conversations.length > 0 && messages.length > 0) {
                //     // Update conversation title or save state
                // }
            }
          } catch (e) {
            console.error("Failed to parse JSON chunk:", line, e);
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
        <h2>History</h2>
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
        <div className="messages-list">
          {messages.map((msg, index) => (
            <div key={index} className={`message ${msg.role}`}>
              <p><strong>{msg.role === 'user' ? 'You' : 'Llama'}:</strong> {msg.content}</p>
            </div>
          ))}
          {isLoading && <div className="message assistant"><p><strong>Llama:</strong> Thinking...</p></div>}
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
