/**
 * A2A Network Client
 * Frontend client for interacting with Agent-to-Agent network contracts
 */

import { ethers } from 'ethers';
import {
  generateKeyPair,
  serializeKeyPair,
  encryptMessage,
  decryptMessage,
  generateContentHash,
  storeKeyPair,
  loadKeyPair,
  type KeyPair,
  type EncryptedMessage,
} from './encryption';

// Contract ABIs (simplified - import full ABIs in production)
const AGENT_REGISTRY_ABI = [
  'function registerAgent(string memory _name, string memory _publicKey, string[] memory _capabilities) external',
  'function updateAgent(string memory _publicKey, string[] memory _capabilities) external',
  'function deactivateAgent() external',
  'function reactivateAgent() external',
  'function getAgent(address agentAddress) external view returns (tuple(address owner, string name, string publicKey, string[] capabilities, uint256 reputation, uint256 totalMessages, uint256 registeredAt, bool isActive))',
  'function getAgentByName(string memory _name) external view returns (address)',
  'function getAgentCount() external view returns (uint256)',
  'function getActiveAgents() external view returns (address[] memory)',
  'function searchByCapability(string memory capability) external view returns (address[] memory)',
  'event AgentRegistered(address indexed agentAddress, string name, string publicKey, uint256 timestamp)',
  'event AgentUpdated(address indexed agentAddress, string name, uint256 timestamp)',
];

const MESSAGE_ROUTER_ABI = [
  'function sendMessage(address recipient, string memory encryptedContent, string memory contentHash, uint256 expiresIn, uint8 messageType) external returns (bytes32)',
  'function markAsRead(bytes32 messageId) external',
  'function getMessage(bytes32 messageId) external view returns (tuple(address sender, address recipient, string encryptedContent, string contentHash, uint256 timestamp, uint256 expiresAt, uint8 status, uint8 messageType))',
  'function getSentMessages(address agent) external view returns (bytes32[] memory)',
  'function getReceivedMessages(address agent) external view returns (bytes32[] memory)',
  'function getUnreadMessages(address agent) external view returns (bytes32[] memory)',
  'function getTotalMessageCount() external view returns (uint256)',
  'event MessageSent(bytes32 indexed messageId, address indexed sender, address indexed recipient, string contentHash, uint8 messageType, uint256 timestamp)',
  'event MessageRead(bytes32 indexed messageId, uint256 timestamp)',
];

export interface AgentInfo {
  owner: string;
  name: string;
  publicKey: string;
  capabilities: string[];
  reputation: bigint;
  totalMessages: bigint;
  registeredAt: bigint;
  isActive: boolean;
}

export interface MessageInfo {
  sender: string;
  recipient: string;
  encryptedContent: string;
  contentHash: string;
  timestamp: bigint;
  expiresAt: bigint;
  status: number;
  messageType: number;
}

export enum MessageType {
  Direct = 0,
  Request = 1,
  Response = 2,
  Broadcast = 3,
}

export enum MessageStatus {
  Pending = 0,
  Delivered = 1,
  Read = 2,
  Failed = 3,
  Expired = 4,
}

export class A2AClient {
  private provider: ethers.BrowserProvider;
  private registryContract: ethers.Contract;
  private routerContract: ethers.Contract;
  private signer: ethers.Signer | null = null;
  private keyPair: KeyPair | null = null;
  private agentAddress: string | null = null;

  constructor(
    registryAddress: string,
    routerAddress: string,
    provider?: ethers.BrowserProvider
  ) {
    this.provider = provider || new ethers.BrowserProvider(window.ethereum);
    this.registryContract = new ethers.Contract(
      registryAddress,
      AGENT_REGISTRY_ABI,
      this.provider
    );
    this.routerContract = new ethers.Contract(
      routerAddress,
      MESSAGE_ROUTER_ABI,
      this.provider
    );
  }

  async connect(): Promise<string> {
    this.signer = await this.provider.getSigner();
    this.agentAddress = await this.signer.getAddress();

    this.registryContract = this.registryContract.connect(this.signer);
    this.routerContract = this.routerContract.connect(this.signer);

    this.keyPair = await loadKeyPair(this.agentAddress);

    if (!this.keyPair) {
      this.keyPair = await generateKeyPair();
      await storeKeyPair(this.keyPair, this.agentAddress);
    }

    return this.agentAddress;
  }

  async registerAgent(name: string, capabilities: string[]): Promise<void> {
    if (!this.signer || !this.keyPair || !this.agentAddress) {
      throw new Error('Client not connected');
    }

    const serializedKeyPair = await serializeKeyPair(this.keyPair);

    const tx = await this.registryContract.registerAgent(
      name,
      serializedKeyPair.publicKey,
      capabilities
    );

    await tx.wait();
  }

  async updateAgent(capabilities: string[]): Promise<void> {
    if (!this.signer || !this.keyPair) {
      throw new Error('Client not connected');
    }

    const serializedKeyPair = await serializeKeyPair(this.keyPair);

    const tx = await this.registryContract.updateAgent(
      serializedKeyPair.publicKey,
      capabilities
    );

    await tx.wait();
  }

  async getAgent(address: string): Promise<AgentInfo> {
    const agent = await this.registryContract.getAgent(address);
    return {
      owner: agent.owner,
      name: agent.name,
      publicKey: agent.publicKey,
      capabilities: agent.capabilities,
      reputation: agent.reputation,
      totalMessages: agent.totalMessages,
      registeredAt: agent.registeredAt,
      isActive: agent.isActive,
    };
  }

  async getActiveAgents(): Promise<string[]> {
    return await this.registryContract.getActiveAgents();
  }

  async searchByCapability(capability: string): Promise<string[]> {
    return await this.registryContract.searchByCapability(capability);
  }

  async sendMessage(
    recipientAddress: string,
    message: string,
    messageType: MessageType = MessageType.Direct,
    expiresIn: number = 86400
  ): Promise<string> {
    if (!this.signer || !this.keyPair) {
      throw new Error('Client not connected');
    }

    const recipient = await this.getAgent(recipientAddress);

    const encryptedMsg = await encryptMessage(message, recipient.publicKey);
    const encryptedContent = JSON.stringify(encryptedMsg);

    const contentHash = await generateContentHash(message);

    const tx = await this.routerContract.sendMessage(
      recipientAddress,
      encryptedContent,
      contentHash,
      expiresIn,
      messageType
    );

    const receipt = await tx.wait();

    const event = receipt.logs.find((log: any) => {
      try {
        const parsed = this.routerContract.interface.parseLog(log);
        return parsed?.name === 'MessageSent';
      } catch {
        return false;
      }
    });

    if (event) {
      const parsed = this.routerContract.interface.parseLog(event);
      return parsed?.args.messageId;
    }

    throw new Error('Message sent but ID not found in events');
  }

  async getMessage(messageId: string): Promise<MessageInfo> {
    const message = await this.routerContract.getMessage(messageId);
    return {
      sender: message.sender,
      recipient: message.recipient,
      encryptedContent: message.encryptedContent,
      contentHash: message.contentHash,
      timestamp: message.timestamp,
      expiresAt: message.expiresAt,
      status: message.status,
      messageType: message.messageType,
    };
  }

  async decryptMessageContent(encryptedContent: string): Promise<string> {
    if (!this.keyPair) {
      throw new Error('Key pair not available');
    }

    const encryptedMsg: EncryptedMessage = JSON.parse(encryptedContent);
    return await decryptMessage(encryptedMsg, this.keyPair.privateKey);
  }

  async markAsRead(messageId: string): Promise<void> {
    if (!this.signer) {
      throw new Error('Client not connected');
    }

    const tx = await this.routerContract.markAsRead(messageId);
    await tx.wait();
  }

  async getSentMessages(): Promise<string[]> {
    if (!this.agentAddress) {
      throw new Error('Client not connected');
    }

    return await this.routerContract.getSentMessages(this.agentAddress);
  }

  async getReceivedMessages(): Promise<string[]> {
    if (!this.agentAddress) {
      throw new Error('Client not connected');
    }

    return await this.routerContract.getReceivedMessages(this.agentAddress);
  }

  async getUnreadMessages(): Promise<string[]> {
    if (!this.agentAddress) {
      throw new Error('Client not connected');
    }

    return await this.routerContract.getUnreadMessages(this.agentAddress);
  }

  async getNetworkStats() {
    const totalMessages = await this.routerContract.getTotalMessageCount();
    const totalAgents = await this.registryContract.getAgentCount();
    const activeAgents = await this.registryContract.getActiveAgents();

    return {
      totalMessages: totalMessages.toString(),
      totalAgents: totalAgents.toString(),
      activeAgents: activeAgents.length,
    };
  }

  getAgentAddress(): string | null {
    return this.agentAddress;
  }

  async regenerateKeyPair(): Promise<void> {
    if (!this.agentAddress) {
      throw new Error('Client not connected');
    }

    this.keyPair = await generateKeyPair();
    await storeKeyPair(this.keyPair, this.agentAddress);

    const serializedKeyPair = await serializeKeyPair(this.keyPair);
    const agent = await this.getAgent(this.agentAddress);

    const tx = await this.registryContract.updateAgent(
      serializedKeyPair.publicKey,
      agent.capabilities
    );

    await tx.wait();
  }
}

export function createA2AClient(
  registryAddress: string,
  routerAddress: string
): A2AClient {
  return new A2AClient(registryAddress, routerAddress);
}
