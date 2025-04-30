import { useState, useEffect, useRef } from 'react';
import './App.css';
import ics from './assets/schedule.txt';
import parseICSForLLM from './ics.js';

function getDate() {
  const currentDate = new Date();
  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
  const day = String(currentDate.getDate()).padStart(2, '0');

  const formattedDate = `${year}-${month}-${day}`;
  return formattedDate;
}

async function parseICS() {
  let res = '';
  const temp = await fetch(ics).then((res) => res.text()).then((text) => {res = text}).catch((e) => console.error(e));
  return parseICSForLLM(res);
}

function App() {
  const [userInput, setUserInput] = useState('');
  const [messages, setMessages] = useState([]); // Initialize with empty array instead of mock messages
  const [conversations, setConversations] = useState([]); // Stores past conversation summaries/IDs for the sidebar
  const [isLoading, setIsLoading] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState(null);
  const messagesEndRef = useRef(null);
  // Add states for suicide prevention popup
  const [showSuicidePopup, setShowSuicidePopup] = useState(false);
  const [callStatus, setCallStatus] = useState('idle'); // idle, ringing, connected
  const [callDuration, setCallDuration] = useState(0);
  const timerRef = useRef(null);

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
      const today = new Date();
      const formattedDate = today.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
      const newConversations = [{ id: newId, title: `[${formattedDate}] Entry` }];
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

  // Function to check for suicidal content
  const checkForSuicidalContent = (text) => {
    const suicidalPhrases = [
      'kill myself', 'suicide', 'suicidal', 'end my life', 'don\'t want to live', 
      'want to die', 'better off dead', 'no reason to live', 'can\'t go on',
      'ending it all', 'take my own life', 'rather be dead', 'no point in living'
    ];
    
    const lowerText = text.toLowerCase();
    return suicidalPhrases.some(phrase => lowerText.includes(phrase));
  };

  // Handle the simulated phone call
  const startSuicideHotlineCall = () => {
    setShowSuicidePopup(true);
    setCallStatus('ringing');
    
    // Simulate ringing for 3 seconds then connect
    setTimeout(() => {
      setCallStatus('connected');
      // Start the call timer
      timerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }, 3000);
  };

  // End the simulated call
  const endSuicideHotlineCall = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    setShowSuicidePopup(false);
    setCallStatus('idle');
    setCallDuration(0);
  };

  const handleInputChange = (event) => {
    setUserInput(event.target.value);
  };

  const handleSendMessage = async (event) => {
    event.preventDefault();
    if (!userInput.trim() || isLoading) return;

    // Check for suicidal content before sending
    if (checkForSuicidalContent(userInput)) {
      startSuicideHotlineCall();
    }

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

  // Function to start a new chat
  const handleNewChat = async () => {
    // Save current conversation messages
    if (currentConversationId && messages.length > 0) {
      localStorage.setItem(`messages-${currentConversationId}`, JSON.stringify(messages));
    }

    const newId = Date.now();
    const today = new Date();
    const formattedDate = today.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
    const newConvo = { id: newId, title: `${formattedDate} Entry` };

    // Create a system message with today's date
    const todayDate = new Date();
    const formattedTodayDate = todayDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const dateSystemMessage = {
      role: 'system',
      content: `Today is ${formattedTodayDate}`
    };

    // Fetch and parse calendar data
    setIsLoading(true);
    try {
      const calendarEvents = await parseICS();
      
      // Mock calendar data for testing
      const mockEvents = "Calculus Midterm Exam at 10:00 AM in Room 204";
      const calendarData = calendarEvents || mockEvents;
      
      // Prepare calendar events for the LLM
      let calendarPrompt = "";
      if (calendarData && calendarData.length > 0) {
        calendarPrompt = "Based on their calendar, they had these events today:\n";
        const events = calendarData.split('\n');
        events.forEach(event => {
          if (event.trim()) {
            calendarPrompt += `- ${event.trim()}\n`;
          }
        });
        calendarPrompt += "\nAsk specific questions about these events in their day.";
      } else {
        calendarPrompt = "No specific events found in their calendar for today. Ask general questions about their day.";
      }

      // System messages with specific event reference
      const systemMessages = [
        dateSystemMessage,
        { 
          role: 'system', 
          content: `You are a living diary that asks the user simple and brief questions about their day. 
Today is ${formattedTodayDate}.

${calendarPrompt}

Start by greeting them briefly, then ask specifically about their calculus midterm.
Keep your responses conversational and caring but concise.
Ask follow-up questions based on their answers to create a meaningful reflection of their day.`
        },
        {
          role: 'assistant',
          content: `Hi! I'm your private, on-device diary. I see you had your calculus midterm exam this morning at 10 AM. How did the exam go? Were you well-prepared for it?`
        }
      ];

      setMessages(systemMessages);
      setConversations(prev => [...prev, newConvo]);
      setCurrentConversationId(newId);
      localStorage.setItem(`messages-${newId}`, JSON.stringify(systemMessages));

    } catch (error) {
      console.error('Error fetching calendar data:', error);
      // Fallback if calendar data can't be loaded
      const fallbackInstruction = { 
        role: 'system', 
        content: `You are a living diary that asks the user simple and brief questions about their day. 
Please inform the user that you are fully private and on-device. 
Today is ${formattedTodayDate}.

Ask general questions about their day since no calendar data could be loaded.`
      };
      
      const newMessages = [dateSystemMessage, fallbackInstruction];
      setMessages(newMessages);
      setConversations(prev => [...prev, newConvo]);
      setCurrentConversationId(newId);
      localStorage.setItem(`messages-${newId}`, JSON.stringify(newMessages));
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
    }

    setCurrentConversationId(id);
  };

  // Format time for the call duration display
  const formatCallTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <h2>Diary Entries</h2>
        <button onClick={handleNewChat} className="new-chat-button">New Entry</button>
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
          {messages
            .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
            .map((msg, index) => (
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

      {/* Suicide Prevention Hotline Call Popup */}
      {showSuicidePopup && (
        <div className="suicide-prevention-popup">
          <div className="popup-content">
            <h2>National Suicide Prevention Lifeline</h2>
            <div className="call-display">
              {callStatus === 'ringing' ? (
                <div className="ringing-animation">
                  <p>Calling... 988</p>
                  <div className="phone-icon">📞</div>
                </div>
              ) : (
                <div className="on-call">
                  <p>Connected with 988</p>
                  <div className="call-timer">{formatCallTime(callDuration)}</div>
                </div>
              )}
            </div>
            <button onClick={endSuicideHotlineCall} className="end-call-button">
              End Call
            </button>
            <p className="disclaimer">
              This is a simulated call. If you're in crisis, please call the real National Suicide Prevention Lifeline at 988.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
