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
    // readyChecker resolves to a boolean — it does NOT throw on a dead/missing
    // cluster, so we must check the returned value, not just catch errors.
    const ready = await client.misc.readyChecker().do();
    if (!ready) {
      console.error(
        `❌ Weaviate not ready at ${scheme}://${cleanHost} — cluster is unreachable or does not exist (check WEAVIATE_HOST / that the cluster still exists in Weaviate Cloud).`,
      );
      return false;
    }
    console.log('✅ Weaviate connection successful');
    return true;
  } catch (error: any) {
    console.error('❌ Weaviate connection failed:', error.message);
    return false;
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const createChatSchema = async (): Promise<void> => {
  const className = 'ChatMemory';
  const schema = {
    class: className,
    vectorizer: 'none', // avoid external API calls and balance issues
    properties: [
      { name: 'content', dataType: ['text'] },
      { name: 'userId', dataType: ['string'] },
      { name: 'role', dataType: ['string'] },
      { name: 'timestamp', dataType: ['date'] },
    ],
  };

  // If the class already exists we don't need to do anything.
  try {
    const existing = await client.schema.getter().do();
    if (existing?.classes?.some((c: any) => c.class === className)) {
      console.log(`✅ Schema '${className}' already exists.`);
      return;
    }
  } catch {
    // ignore — fall through to create with retries
  }

  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await client.schema.classCreator().withClass(schema).do();
      console.log(`✅ Schema '${className}' created successfully.`);
      return;
    } catch (error: any) {
      // undici hides the real network error under `.cause`
      const cause = error?.cause ?? error?.message;
      console.error(
        `❌ Schema creation attempt ${attempt}/${maxAttempts} failed:`,
        error?.message,
        cause,
      );
      if (attempt < maxAttempts) {
        const backoff = attempt * 2000; // 2s, 4s, 6s... lets a cold cluster wake up
        console.log(`⏳ Retrying in ${backoff / 1000}s...`);
        await sleep(backoff);
      }
    }
  }
  console.error(`❌ Could not create schema '${className}' after ${maxAttempts} attempts.`);
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