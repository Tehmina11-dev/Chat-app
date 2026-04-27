import weaviate from 'weaviate-ts-client';
import dotenv from 'dotenv';

dotenv.config();

// --- 1. BULLETPROOF CLIENT INITIALIZATION ---
const rawHost = process.env.WEAVIATE_HOST || process.env.WEAVIATE_URL || '';
const scheme = (process.env.WEAVIATE_SCHEME || 'https').replace(/^https?:\/\//, '').replace(/\/$/, '');
// This ensures we have a clean domain like 'brp...weaviate.network'
const cleanHost = rawHost.replace(/^https?:\/\//, '').replace(/\/$/, '');
if (!cleanHost) {
  console.error("❌ ERROR: WEAVIATE_HOST or WEAVIATE_URL is missing in environment variables!");
  throw new Error("Missing WEAVIATE_HOST / WEAVIATE_URL");
}

console.log(`🌐 Connecting to Weaviate at: ${scheme}://${cleanHost}`);

const clientConfig: any = {
  scheme,
  host: cleanHost,
};

const apiKey = process.env.WEAVIATE_API_KEY;
if (apiKey) {
  clientConfig.apiKey = new (weaviate as any).ApiKey(apiKey);
}

const client = (weaviate as any).client(clientConfig);

// --- 2. CONNECTION & SCHEMA HELPERS ---

export const testConnection = async (): Promise<boolean> => {
  try {
    // Check if the server is actually reachable
    await client.misc.readyChecker().do();
    console.log('✅ Weaviate connection successful');
    return true;
  } catch (error: any) {
    console.error('❌ Weaviate connection failed:', error.message);
    return false;
  }
};

export const createChatSchema = async (): Promise<void> => {
  const className = 'ChatMemory';
  try {
    // --- STEP A: THE CLEANUP ---
    // Clears old broken configurations (like the OpenAI vectorizer issue)
    console.log(`🧹 Cleaning up old schema for '${className}'...`);
    await client.schema.classDeleter().withClassName(className).do().catch(() => {});

    // --- STEP B: THE NEW SCHEMA ---
    // Using vectorizer: 'none' to avoid external API calls and balance issues
    const schema = {
      class: className,
      vectorizer: 'none', 
      properties: [
        { name: 'content', dataType: ['text'] },
        { name: 'userId', dataType: ['string'] },
        { name: 'role', dataType: ['string'] },
        { name: 'timestamp', dataType: ['date'] },
      ],
    };

    await client.schema.classCreator().withClass(schema).do();
    console.log(`✅ Schema '${className}' created successfully.`);
  } catch (error: any) {
    console.error(`❌ Schema creation error:`, error.message);
  }
};

// --- 3. CORE RAG FUNCTIONS ---

export const getRelevantContext = async (userId: string, userQuery: string): Promise<string> => {
  if (!userQuery) return '';
  try {
    // Retrieval using filtering (since vectorizer is 'none')
    const result = await client.graphql
      .get()
      .withClassName('ChatMemory')
      .withFields('content role')
      .withWhere({
        path: ['userId'],
        operator: 'Equal',
        valueString: userId,
      })
      .withLimit(10)
      .do();

    const contextList = result.data?.Get?.ChatMemory || [];
    return contextList.length > 0 
      ? contextList.map((m: any) => `${m.role}: ${m.content}`).join('\n')
      : "No previous history.";
  } catch (error: any) {
    console.error('❌ Weaviate Retrieval Error:', error.message);
    return '';
  }
};

export const saveMessageToMemory = async (userId: string, content: string, role: string): Promise<any> => {
  if (!content) return;
  try {
    const result = await client.data.creator()
      .withClassName('ChatMemory')
      .withProperties({
        content,
        userId,
        role,
        timestamp: new Date().toISOString(),
      })
      .do();
    
    console.log(`💾 Memory Saved: ${role} message indexed.`);
    return result;
  } catch (error: any) {
    console.error('❌ Weaviate Save Error:', error.message);
  }
};

export default client;