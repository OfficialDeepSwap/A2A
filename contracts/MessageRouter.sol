// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AgentRegistry.sol";

/**
 * @title MessageRouter
 * @notice Routes encrypted messages between agents in the A2A network
 * @dev Handles message delivery, acknowledgment, and reputation updates
 */
contract MessageRouter {
    AgentRegistry public registry;

    struct Message {
        address sender;
        address recipient;
        string encryptedContent;
        string contentHash;
        uint256 timestamp;
        uint256 expiresAt;
        MessageStatus status;
        MessageType messageType;
    }

    struct MessageThread {
        bytes32 threadId;
        address[] participants;
        uint256 messageCount;
        uint256 createdAt;
        bool isActive;
    }

    enum MessageStatus {
        Pending,
        Delivered,
        Read,
        Failed,
        Expired
    }

    enum MessageType {
        Direct,
        Request,
        Response,
        Broadcast
    }

    mapping(bytes32 => Message) public messages;
    mapping(address => bytes32[]) public sentMessages;
    mapping(address => bytes32[]) public receivedMessages;
    mapping(bytes32 => MessageThread) public threads;
    mapping(address => mapping(address => bytes32)) public directThreads;

    bytes32[] public allMessageIds;
    uint256 public messageCount;

    event MessageSent(
        bytes32 indexed messageId,
        address indexed sender,
        address indexed recipient,
        string contentHash,
        MessageType messageType,
        uint256 timestamp
    );

    event MessageDelivered(
        bytes32 indexed messageId,
        uint256 timestamp
    );

    event MessageRead(
        bytes32 indexed messageId,
        uint256 timestamp
    );

    event MessageFailed(
        bytes32 indexed messageId,
        string reason,
        uint256 timestamp
    );

    event ThreadCreated(
        bytes32 indexed threadId,
        address[] participants,
        uint256 timestamp
    );

    modifier onlyRegisteredAgent() {
        (address owner,,,,,,,) = registry.agents(msg.sender);
        require(owner != address(0), "Agent not registered");
        _;
    }

    modifier onlyMessageParticipant(bytes32 messageId) {
        Message memory message = messages[messageId];
        require(
            msg.sender == message.sender || msg.sender == message.recipient,
            "Not a message participant"
        );
        _;
    }

    constructor(address _registryAddress) {
        registry = AgentRegistry(_registryAddress);
    }

    /**
     * @notice Send an encrypted message to another agent
     * @param recipient Address of the recipient agent
     * @param encryptedContent Encrypted message content
     * @param contentHash Hash of the original content for verification
     * @param expiresIn Time in seconds until message expires
     * @param messageType Type of message being sent
     * @return messageId Unique identifier for the message
     */
    function sendMessage(
        address recipient,
        string memory encryptedContent,
        string memory contentHash,
        uint256 expiresIn,
        MessageType messageType
    ) external onlyRegisteredAgent returns (bytes32) {
        require(recipient != address(0), "Invalid recipient");
        require(recipient != msg.sender, "Cannot send to self");
        require(bytes(encryptedContent).length > 0, "Empty message");

        (address recipientOwner,,,,,,,bool isActive) = registry.agents(recipient);
        require(recipientOwner != address(0), "Recipient not registered");
        require(isActive, "Recipient not active");

        bytes32 messageId = keccak256(
            abi.encodePacked(
                msg.sender,
                recipient,
                encryptedContent,
                block.timestamp,
                messageCount
            )
        );

        messages[messageId] = Message({
            sender: msg.sender,
            recipient: recipient,
            encryptedContent: encryptedContent,
            contentHash: contentHash,
            timestamp: block.timestamp,
            expiresAt: block.timestamp + expiresIn,
            status: MessageStatus.Delivered,
            messageType: messageType
        });

        sentMessages[msg.sender].push(messageId);
        receivedMessages[recipient].push(messageId);
        allMessageIds.push(messageId);
        messageCount++;

        registry.incrementMessageCount(msg.sender);
        registry.incrementMessageCount(recipient);

        bytes32 threadId = getOrCreateThread(msg.sender, recipient);

        emit MessageSent(
            messageId,
            msg.sender,
            recipient,
            contentHash,
            messageType,
            block.timestamp
        );

        emit MessageDelivered(messageId, block.timestamp);

        return messageId;
    }

    /**
     * @notice Mark a message as read
     * @param messageId ID of the message
     */
    function markAsRead(bytes32 messageId) external onlyMessageParticipant(messageId) {
        Message storage message = messages[messageId];
        require(msg.sender == message.recipient, "Only recipient can mark as read");
        require(message.status != MessageStatus.Expired, "Message expired");

        message.status = MessageStatus.Read;

        registry.updateReputation(message.sender, 1);

        emit MessageRead(messageId, block.timestamp);
    }

    /**
     * @notice Get or create a message thread between two agents
     * @param agent1 First agent address
     * @param agent2 Second agent address
     * @return threadId Unique identifier for the thread
     */
    function getOrCreateThread(address agent1, address agent2) internal returns (bytes32) {
        bytes32 existingThread = directThreads[agent1][agent2];

        if (existingThread != bytes32(0)) {
            threads[existingThread].messageCount++;
            return existingThread;
        }

        existingThread = directThreads[agent2][agent1];
        if (existingThread != bytes32(0)) {
            threads[existingThread].messageCount++;
            return existingThread;
        }

        bytes32 threadId = keccak256(
            abi.encodePacked(
                agent1 < agent2 ? agent1 : agent2,
                agent1 < agent2 ? agent2 : agent1,
                block.timestamp
            )
        );

        address[] memory participants = new address[](2);
        participants[0] = agent1;
        participants[1] = agent2;

        threads[threadId] = MessageThread({
            threadId: threadId,
            participants: participants,
            messageCount: 1,
            createdAt: block.timestamp,
            isActive: true
        });

        directThreads[agent1][agent2] = threadId;
        directThreads[agent2][agent1] = threadId;

        emit ThreadCreated(threadId, participants, block.timestamp);

        return threadId;
    }

    /**
     * @notice Get message details
     * @param messageId ID of the message
     * @return Message struct
     */
    function getMessage(bytes32 messageId) external view returns (Message memory) {
        return messages[messageId];
    }

    /**
     * @notice Get messages sent by an agent
     * @param agent Address of the agent
     * @return Array of message IDs
     */
    function getSentMessages(address agent) external view returns (bytes32[] memory) {
        return sentMessages[agent];
    }

    /**
     * @notice Get messages received by an agent
     * @param agent Address of the agent
     * @return Array of message IDs
     */
    function getReceivedMessages(address agent) external view returns (bytes32[] memory) {
        return receivedMessages[agent];
    }

    /**
     * @notice Get thread between two agents
     * @param agent1 First agent address
     * @param agent2 Second agent address
     * @return MessageThread struct
     */
    function getThread(address agent1, address agent2) external view returns (MessageThread memory) {
        bytes32 threadId = directThreads[agent1][agent2];
        if (threadId == bytes32(0)) {
            threadId = directThreads[agent2][agent1];
        }
        return threads[threadId];
    }

    /**
     * @notice Get unread messages for an agent
     * @param agent Address of the agent
     * @return Array of unread message IDs
     */
    function getUnreadMessages(address agent) external view returns (bytes32[] memory) {
        bytes32[] memory received = receivedMessages[agent];
        uint256 unreadCount = 0;

        for (uint256 i = 0; i < received.length; i++) {
            if (messages[received[i]].status == MessageStatus.Delivered) {
                unreadCount++;
            }
        }

        bytes32[] memory unread = new bytes32[](unreadCount);
        uint256 index = 0;

        for (uint256 i = 0; i < received.length; i++) {
            if (messages[received[i]].status == MessageStatus.Delivered) {
                unread[index] = received[i];
                index++;
            }
        }

        return unread;
    }

    /**
     * @notice Clean up expired messages
     * @param messageIds Array of message IDs to check
     */
    function cleanupExpiredMessages(bytes32[] memory messageIds) external {
        for (uint256 i = 0; i < messageIds.length; i++) {
            Message storage message = messages[messageIds[i]];

            if (
                message.expiresAt > 0 &&
                block.timestamp > message.expiresAt &&
                message.status != MessageStatus.Read
            ) {
                message.status = MessageStatus.Expired;
            }
        }
    }

    /**
     * @notice Get total message count
     * @return Total number of messages
     */
    function getTotalMessageCount() external view returns (uint256) {
        return messageCount;
    }

    /**
     * @notice Get recent messages (last N messages)
     * @param count Number of recent messages to retrieve
     * @return Array of message IDs
     */
    function getRecentMessages(uint256 count) external view returns (bytes32[] memory) {
        uint256 total = allMessageIds.length;
        uint256 resultCount = count > total ? total : count;

        bytes32[] memory recent = new bytes32[](resultCount);

        for (uint256 i = 0; i < resultCount; i++) {
            recent[i] = allMessageIds[total - 1 - i];
        }

        return recent;
    }
}
