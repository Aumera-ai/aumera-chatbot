const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY;

async function supabaseQuery(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
  });
  if (!res.ok) return [];
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const { message, phone } = req.body;
  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

  try {
    const products = await supabaseQuery("products?select=name,description,price,category,stock&limit=50");

    let orderContext = "";
    if (phone) {
      const customers = await supabaseQuery(`customers?phone=eq.${encodeURIComponent(phone)}&select=id`);
      if (customers.length > 0) {
        const orders = await supabaseQuery(
          `orders?customer_id=eq.${customers[0].id}&select=id,status,total_amount,quantity,created_at&order=created_at.desc&limit=5`
        );
        orderContext = `\n\nThis customer's recent orders:\n${JSON.stringify(orders, null, 2)}`;
      }
    }

    const systemPrompt = `You are the customer support assistant for AumerA Fashion Hub, a fashion e-commerce store in India (aumera.tweaki.sbs). Reply in Malayalam unless the customer writes in English. Be warm, brief, and helpful. Help with product questions, order status, returns, and general store queries. Never invent order details or prices — only use what's given below. If you don't have the info, say so and suggest contacting the store directly.

Available products:
${JSON.stringify(products, null, 2)}
${orderContext}`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: "user", content: message }],
      }),
    });

    const claudeData = await claudeRes.json();
    const reply = claudeData.content?.[0]?.text || "ക്ഷമിക്കണം, ഒരു പ്രശ്നം ഉണ്ടായി. വീണ്ടും ശ്രമിക്കൂ.";

    fetch(`${SUPABASE_URL}/rest/v1/chat_logs`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ customer_phone: phone || null, message, reply }),
    }).catch(() => {});

    return res.status(200).json({ reply });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Something went wrong" });
  }
}
