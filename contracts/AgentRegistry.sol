// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AgentRegistry
 * @notice Registry for AI agents in the agent-to-agent network
 * @dev Manages agent registration, discovery, and reputation
 */
contract AgentRegistry {
    struct Agent {
        address owner;
        string name;
        string publicKey;
        string[] capabilities;
        uint256 reputation;
        uint256 totalMessages;
        uint256 registeredAt;
        bool isActive;
    }

    mapping(address => Agent) public agents;
    mapping(bytes32 => address) public nameToAddress;
    address[] public agentList;

    event AgentRegistered(
        address indexed agentAddress,
        string name,
        string publicKey,
        uint256 timestamp
    );

    event AgentUpdated(
        address indexed agentAddress,
        string name,
        uint256 timestamp
    );

    event AgentDeactivated(
        address indexed agentAddress,
        uint256 timestamp
    );

    event ReputationUpdated(
        address indexed agentAddress,
        uint256 newReputation,
        int256 change
    );

    modifier onlyAgentOwner(address agentAddress) {
        require(
            agents[agentAddress].owner == msg.sender,
            "Not agent owner"
        );
        _;
    }

    modifier agentExists(address agentAddress) {
        require(agents[agentAddress].owner != address(0), "Agent does not exist");
        _;
    }

    /**
     * @notice Register a new agent in the network
     * @param _name Unique name for the agent
     * @param _publicKey Public key for encrypted communication
     * @param _capabilities Array of agent capabilities
     */
    function registerAgent(
        string memory _name,
        string memory _publicKey,
        string[] memory _capabilities
    ) external {
        require(agents[msg.sender].owner == address(0), "Agent already registered");
        require(bytes(_name).length > 0, "Name cannot be empty");
        require(bytes(_publicKey).length > 0, "Public key cannot be empty");

        bytes32 nameHash = keccak256(abi.encodePacked(_name));
        require(nameToAddress[nameHash] == address(0), "Name already taken");

        agents[msg.sender] = Agent({
            owner: msg.sender,
            name: _name,
            publicKey: _publicKey,
            capabilities: _capabilities,
            reputation: 100,
            totalMessages: 0,
            registeredAt: block.timestamp,
            isActive: true
        });

        nameToAddress[nameHash] = msg.sender;
        agentList.push(msg.sender);

        emit AgentRegistered(msg.sender, _name, _publicKey, block.timestamp);
    }

    /**
     * @notice Update agent information
     * @param _publicKey New public key
     * @param _capabilities Updated capabilities
     */
    function updateAgent(
        string memory _publicKey,
        string[] memory _capabilities
    ) external agentExists(msg.sender) onlyAgentOwner(msg.sender) {
        Agent storage agent = agents[msg.sender];
        require(agent.isActive, "Agent is not active");

        if (bytes(_publicKey).length > 0) {
            agent.publicKey = _publicKey;
        }

        agent.capabilities = _capabilities;

        emit AgentUpdated(msg.sender, agent.name, block.timestamp);
    }

    /**
     * @notice Deactivate an agent
     */
    function deactivateAgent() external agentExists(msg.sender) onlyAgentOwner(msg.sender) {
        agents[msg.sender].isActive = false;
        emit AgentDeactivated(msg.sender, block.timestamp);
    }

    /**
     * @notice Reactivate an agent
     */
    function reactivateAgent() external agentExists(msg.sender) onlyAgentOwner(msg.sender) {
        agents[msg.sender].isActive = true;
    }

    /**
     * @notice Update agent reputation (called by message router)
     * @param agentAddress Address of the agent
     * @param change Change in reputation (positive or negative)
     */
    function updateReputation(address agentAddress, int256 change) external agentExists(agentAddress) {
        Agent storage agent = agents[agentAddress];

        if (change > 0) {
            agent.reputation += uint256(change);
        } else if (change < 0) {
            uint256 decrease = uint256(-change);
            if (agent.reputation > decrease) {
                agent.reputation -= decrease;
            } else {
                agent.reputation = 0;
            }
        }

        emit ReputationUpdated(agentAddress, agent.reputation, change);
    }

    /**
     * @notice Increment message count for an agent
     * @param agentAddress Address of the agent
     */
    function incrementMessageCount(address agentAddress) external agentExists(agentAddress) {
        agents[agentAddress].totalMessages++;
    }

    /**
     * @notice Get agent details
     * @param agentAddress Address of the agent
     * @return Agent struct
     */
    function getAgent(address agentAddress) external view returns (Agent memory) {
        return agents[agentAddress];
    }

    /**
     * @notice Get agent address by name
     * @param _name Name of the agent
     * @return Address of the agent
     */
    function getAgentByName(string memory _name) external view returns (address) {
        bytes32 nameHash = keccak256(abi.encodePacked(_name));
        return nameToAddress[nameHash];
    }

    /**
     * @notice Get total number of registered agents
     * @return Number of agents
     */
    function getAgentCount() external view returns (uint256) {
        return agentList.length;
    }

    /**
     * @notice Get list of active agents
     * @return Array of active agent addresses
     */
    function getActiveAgents() external view returns (address[] memory) {
        uint256 activeCount = 0;

        for (uint256 i = 0; i < agentList.length; i++) {
            if (agents[agentList[i]].isActive) {
                activeCount++;
            }
        }

        address[] memory activeAgents = new address[](activeCount);
        uint256 index = 0;

        for (uint256 i = 0; i < agentList.length; i++) {
            if (agents[agentList[i]].isActive) {
                activeAgents[index] = agentList[i];
                index++;
            }
        }

        return activeAgents;
    }

    /**
     * @notice Search agents by capability
     * @param capability Capability to search for
     * @return Array of agent addresses with the capability
     */
    function searchByCapability(string memory capability) external view returns (address[] memory) {
        uint256 matchCount = 0;

        for (uint256 i = 0; i < agentList.length; i++) {
            if (agents[agentList[i]].isActive && hasCapability(agentList[i], capability)) {
                matchCount++;
            }
        }

        address[] memory matches = new address[](matchCount);
        uint256 index = 0;

        for (uint256 i = 0; i < agentList.length; i++) {
            if (agents[agentList[i]].isActive && hasCapability(agentList[i], capability)) {
                matches[index] = agentList[i];
                index++;
            }
        }

        return matches;
    }

    /**
     * @notice Check if agent has a specific capability
     * @param agentAddress Address of the agent
     * @param capability Capability to check
     * @return True if agent has the capability
     */
    function hasCapability(address agentAddress, string memory capability) public view returns (bool) {
        Agent memory agent = agents[agentAddress];

        for (uint256 i = 0; i < agent.capabilities.length; i++) {
            if (keccak256(abi.encodePacked(agent.capabilities[i])) == keccak256(abi.encodePacked(capability))) {
                return true;
            }
        }

        return false;
    }
}
