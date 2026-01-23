# AG-UI WebSocket Chat System - E2E Test Plan

## Test Environment

- Frontend: http://127.0.0.1:3002/agent-chat/test-session
- Backend: http://127.0.0.1:5000
- WebSocket: ws://127.0.0.1:5000/ag-ui/ws

## Test Cases

### Test 1: Page Load & Component Rendering

**Steps:**

1. Navigate to http://127.0.0.1:3002/agent-chat/test-session
2. Verify page loads without errors
3. Check browser console for JavaScript errors
4. Verify AGUIChat component renders

**Expected:**

- ✅ Page loads successfully
- ✅ See "AG-UI Chat" header
- ✅ See session ID: "test-session"
- ✅ See model selector dropdown with 11 options
- ✅ See connection status indicator
- ✅ See welcome message from agent
- ✅ See message input field and Send button

---

### Test 2: WebSocket Connection

**Steps:**

1. Open browser DevTools (F12)
2. Go to Network tab
3. Filter by WS (WebSocket)
4. Look for connection to `ws://127.0.0.1:5000/ag-ui/ws`
5. Check connection status indicator on page

**Expected:**

- ✅ WebSocket connection established
- ✅ Connection status shows "Connected" (green indicator)
- ✅ Authentication message sent: `{"jsonrpc":"2.0","id":1,"method":"authenticate","params":{"sessionId":"test-session","token":"dev-token-123"}}`
- ✅ Authentication response received: `{"jsonrpc":"2.0","result":{"authenticated":true,"sessionId":"test-session"},"id":1}`

---

### Test 3: Send First Message

**Steps:**

1. Type "Hello, my name is Alice" in message input
2. Click Send button (or press Enter)
3. Watch message appear in chat
4. Check DevTools Network tab for WebSocket messages

**Expected:**

- ✅ User message appears in chat immediately
- ✅ Message shows blue background (right-aligned)
- ✅ Message timestamp displayed
- ✅ WebSocket sends: `{"jsonrpc":"2.0","id":<timestamp>,"method":"agent.message","params":{"content":"Hello, my name is Alice","sessionId":"test-session","model":"opencode/glm-4.7-free"}}`
- ✅ "Agent is typing..." indicator appears
- ✅ AI response appears in chat
- ✅ AI message shows white background (left-aligned)
- ✅ AI message includes model name: "OpenCode GLM-4.7 Free"
- ✅ WebSocket receives: `{"type":"agent.message","data":{"content":"...","role":"assistant","model":"opencode/glm-4.7-free"}}`

---

### Test 4: Conversation Memory

**Steps:**

1. Send "What is my name?" as second message
2. Check if AI response mentions "Alice"
3. Check DevTools Console for conversation history

**Expected:**

- ✅ AI response mentions "Alice" (proving it remembers)
- ✅ AI includes context about previous conversation
- ✅ Backend logs show: `Previous conversation: user: Hello, my name is Alice...`

---

### Test 5: Model Switching

**Steps:**

1. Click model selector dropdown
2. Select "GPT-5 Nano" (change from default)
3. Send a message: "What model are you using?"
4. Verify AI response mentions "GPT-5 Nano"
5. Check browser localStorage

**Expected:**

- ✅ Model selector shows "GPT-5 Nano" selected
- ✅ AI response says "I'm responding as GPT-5 Nano"
- ✅ localStorage contains: `agui_selected_model` = "openai/gpt-5-nano"
- ✅ WebSocket message includes: `"model":"openai/gpt-5-nano"`

---

### Test 6: Message Persistence

**Steps:**

1. Send 3-4 messages in the chat
2. Open browser DevTools Application tab
3. Find Local Storage
4. Look for key: `chat_test-session`
5. Refresh the page (F5)
6. Verify messages reappear

**Expected:**

- ✅ Messages saved to localStorage
- ✅ localStorage key exists: `chat_test-session`
- ✅ Data structure: `{messages:[...], timestamp:..., lastActivity:...}`
- ✅ After refresh, all messages reappear
- ✅ Conversation state preserved

---

### Test 7: Session Management

**Steps:**

1. Click "新建會話" (Create New Session) button
2. Verify new session created with unique ID
3. Type a message in new session
4. Click on "test-session" in saved sessions list
5. Verify previous session messages reappear

**Expected:**

- ✅ New session created (e.g., `session_1737421234567_x8j9k2p3q`)
- ✅ Current session ID changes
- ✅ Messages cleared in new session
- ✅ Clicking old session restores its messages
- ✅ Session list shows both sessions
- ✅ Current session highlighted (📌 indicator)

---

### Test 8: WebSocket Reconnection

**Steps:**

1. Stop backend server temporarily (Ctrl+C in terminal)
2. Watch connection status change to "Disconnected" (red)
3. Wait a few seconds
4. Restart backend server
5. Watch connection status return to "Connected" (green)
6. Check if reconnection attempts are logged

**Expected:**

- ✅ Connection status shows "Disconnected"
- ✅ WebSocket closes cleanly
- ✅ Reconnection attempts shown in console
- ✅ After server restart, connection restored
- ✅ Messages sent during disconnect queued (if implemented)

---

### Test 9: Error Handling

**Steps:**

1. Disconnect from WebSocket (close DevTools or stop server)
2. Try to send a message
3. Observe behavior

**Expected:**

- ✅ Message appears in chat UI (queued offline)
- ✅ Toast or indicator shows "Message queued"
- ✅ Message marked as offline
- ✅ Upon reconnection, queued message is sent automatically

---

### Test 10: Edge Cases

**Test 10.1: Empty Message**

- Try sending empty message
- **Expected**: Send button disabled, nothing happens

**Test 10.2: Long Message**

- Type a very long message (1000+ characters)
- **Expected**: Message sent and displayed properly, no truncation

**Test 10.3: Special Characters**

- Send message with emoji: 🎉🤖✨
- **Expected**: Characters preserved in message and response

**Test 10.4: Rapid Messages**

- Send 3 messages quickly
- **Expected**: All messages display correctly, proper ordering

---

## Backend Verification

While testing, monitor backend logs:

```bash
tail -f opencode-server.log | grep -i ag-ui
```

**Expected logs:**

```
[AG-UI] Authentication handler called with sessionId: test-session
[AG-UI] Adding session test-session to sessionManager
[AG-UI] Session added. Available sessions: test-session
[AG-UI] User authenticated via WebSocket, session: test-session
[AG-UI] Processing agent message: "Hello, my name is Alice" for session test-session
[AG-UI] Broadcasting thinking status for session test-session
[AG-UI] Generated AI response using model: opencode/glm-4.7-free, with 1 messages of context
[AG-UI] Broadcasting response for session: test-session
[AG-UI] Successfully processed message for session: test-session
```

---

## Success Criteria

The test is considered **PASS** if:

- ✅ All 10 test categories completed
- ✅ WebSocket connection stable throughout
- ✅ No JavaScript console errors
- ✅ AI responses include conversation context
- ✅ Model switching works correctly
- ✅ Message persistence survives page refresh
- ✅ Session management works
- ✅ Reconnection works as expected

---

## Known Limitations

Current implementation uses:

- Mock AI responses (not connected to real LLM)
- Simple token-based authentication (no real user auth)
- In-memory conversation history (lost on server restart)
- Basic error handling (can be improved)

---

## Test Report Template

```
Date: ____________
Tester: _________
Environment: _______

Results:
- Test 1 (Page Load): ☐ PASS ☐ FAIL
- Test 2 (WebSocket): ☐ PASS ☐ FAIL
- Test 3 (Send Message): ☐ PASS ☐ FAIL
- Test 4 (Memory): ☐ PASS ☐ FAIL
- Test 5 (Model Switch): ☐ PASS ☐ FAIL
- Test 6 (Persistence): ☐ PASS ☐ FAIL
- Test 7 (Sessions): ☐ PASS ☐ FAIL
- Test 8 (Reconnect): ☐ PASS ☐ FAIL
- Test 9 (Errors): ☐ PASS ☐ FAIL
- Test 10 (Edge Cases): ☐ PASS ☐ FAIL

Total: ____ / 10 passed

Issues Found:
1. _______________________________
2. _______________________________
3. _______________________________

Recommendations:
_______________________________
```
