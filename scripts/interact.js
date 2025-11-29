const hre = require('hardhat');
require('dotenv').config();

async function main() {
  console.log('🤖 A2A Network Interaction Script\n');

  const registryAddress = process.env.AGENT_REGISTRY_ADDRESS;
  const routerAddress = process.env.MESSAGE_ROUTER_ADDRESS;

  if (!registryAddress || !routerAddress) {
    console.error('❌ Please set AGENT_REGISTRY_ADDRESS and MESSAGE_ROUTER_ADDRESS in .env file');
    process.exit(1);
  }

  const [agent1, agent2] = await hre.ethers.getSigners();

  console.log('Agent 1 Address:', agent1.address);
  console.log('Agent 2 Address:', agent2.address, '\n');

  const AgentRegistry = await hre.ethers.getContractFactory('AgentRegistry');
  const registry = AgentRegistry.attach(registryAddress);

  const MessageRouter = await hre.ethers.getContractFactory('MessageRouter');
  const router = MessageRouter.attach(routerAddress);

  console.log('═══════════════════════════════════════════════════════════');
  console.log('📝 Registering Agents');
  console.log('═══════════════════════════════════════════════════════════\n');

  const publicKey1 = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEAgent1PublicKeyExample==';
  const publicKey2 = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEAgent2PublicKeyExample==';

  console.log('Registering Agent 1...');
  const tx1 = await registry.connect(agent1).registerAgent(
    'AI_Trading_Agent',
    publicKey1,
    ['trading', 'market_analysis', 'risk_assessment']
  );
  await tx1.wait();
  console.log('✅ Agent 1 registered\n');

  console.log('Registering Agent 2...');
  const tx2 = await registry.connect(agent2).registerAgent(
    'AI_Research_Agent',
    publicKey2,
    ['research', 'data_analysis', 'reporting']
  );
  await tx2.wait();
  console.log('✅ Agent 2 registered\n');

  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔍 Querying Agent Information');
  console.log('═══════════════════════════════════════════════════════════\n');

  const agentData1 = await registry.getAgent(agent1.address);
  console.log('Agent 1 Details:');
  console.log('  Name:', agentData1.name);
  console.log('  Reputation:', agentData1.reputation.toString());
  console.log('  Capabilities:', agentData1.capabilities.join(', '));
  console.log('  Active:', agentData1.isActive, '\n');

  const agentData2 = await registry.getAgent(agent2.address);
  console.log('Agent 2 Details:');
  console.log('  Name:', agentData2.name);
  console.log('  Reputation:', agentData2.reputation.toString());
  console.log('  Capabilities:', agentData2.capabilities.join(', '));
  console.log('  Active:', agentData2.isActive, '\n');

  const totalAgents = await registry.getAgentCount();
  console.log('Total Registered Agents:', totalAgents.toString(), '\n');

  const activeAgents = await registry.getActiveAgents();
  console.log('Active Agents:', activeAgents.length, '\n');

  console.log('═══════════════════════════════════════════════════════════');
  console.log('💬 Sending Encrypted Messages');
  console.log('═══════════════════════════════════════════════════════════\n');

  const encryptedMessage = JSON.stringify({
    ciphertext: 'EncryptedDataExample123',
    iv: 'RandomIVExample',
    ephemeralPublicKey: 'EphemeralKeyExample',
    tag: 'AuthTagExample',
  });

  const contentHash = 'sha256HashOfOriginalMessage';

  console.log('Agent 1 sending message to Agent 2...');
  const msgTx = await router.connect(agent1).sendMessage(
    agent2.address,
    encryptedMessage,
    contentHash,
    86400,
    0
  );
  const receipt = await msgTx.wait();

  const sentEvent = receipt.logs.find(
    (log) => {
      try {
        return router.interface.parseLog(log)?.name === 'MessageSent';
      } catch {
        return false;
      }
    }
  );

  let messageId;
  if (sentEvent) {
    const parsed = router.interface.parseLog(sentEvent);
    messageId = parsed.args.messageId;
    console.log('✅ Message sent! ID:', messageId, '\n');
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('📨 Retrieving Messages');
  console.log('═══════════════════════════════════════════════════════════\n');

  const sentMessages = await router.getSentMessages(agent1.address);
  console.log('Agent 1 sent', sentMessages.length, 'message(s)');

  const receivedMessages = await router.getReceivedMessages(agent2.address);
  console.log('Agent 2 received', receivedMessages.length, 'message(s)\n');

  if (messageId) {
    const message = await router.getMessage(messageId);
    console.log('Message Details:');
    console.log('  From:', message.sender);
    console.log('  To:', message.recipient);
    console.log('  Status:', ['Pending', 'Delivered', 'Read', 'Failed', 'Expired'][message.status]);
    console.log('  Type:', ['Direct', 'Request', 'Response', 'Broadcast'][message.messageType]);
    console.log('  Timestamp:', new Date(Number(message.timestamp) * 1000).toISOString(), '\n');

    console.log('Agent 2 marking message as read...');
    const readTx = await router.connect(agent2).markAsRead(messageId);
    await readTx.wait();
    console.log('✅ Message marked as read\n');

    const updatedAgentData1 = await registry.getAgent(agent1.address);
    console.log('Agent 1 reputation updated to:', updatedAgentData1.reputation.toString(), '\n');
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔍 Searching Agents by Capability');
  console.log('═══════════════════════════════════════════════════════════\n');

  const tradingAgents = await registry.searchByCapability('trading');
  console.log('Agents with "trading" capability:', tradingAgents.length);

  const researchAgents = await registry.searchByCapability('research');
  console.log('Agents with "research" capability:', researchAgents.length, '\n');

  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 Network Statistics');
  console.log('═══════════════════════════════════════════════════════════\n');

  const totalMessages = await router.getTotalMessageCount();
  console.log('Total Messages:', totalMessages.toString());

  const unreadMessages = await router.getUnreadMessages(agent2.address);
  console.log('Unread Messages for Agent 2:', unreadMessages.length, '\n');

  console.log('✅ Interaction script completed successfully!\n');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
