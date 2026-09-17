export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            error: "Method not allowed"
        });
    }

    const API_KEY = process.env.GEMINI_API_KEY;

    if (!API_KEY) {
        return res.status(500).json({
            error: "Chưa cấu hình GEMINI_API_KEY trên Vercel."
        });
    }

    try {
        const { message, history = [] } = req.body || {};

        if (!message || typeof message !== "string") {
            return res.status(400).json({
                error: "Tin nhắn không hợp lệ."
            });
        }

        const contents = [];

        for (const item of history) {
            if (!item || !item.text) continue;

            contents.push({
                role: item.role === "model" ? "model" : "user",
                parts: [
                    {
                        text: String(item.text)
                    }
                ]
            });
        }

        contents.push({
            role: "user",
            parts: [
                {
                    text: message
                }
            ]
        });

        const response = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": API_KEY
                },
                body: JSON.stringify({
                    systemInstruction: {
                        parts: [
                            {
                                text:
                                    "Bạn là NCB-AI, một trợ lý AI hỗ trợ người chơi. Hãy trả lời bằng tiếng Việt, thân thiện, dễ hiểu và hữu ích."
                            }
                        ]
                    },
                    contents: contents
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                error:
                    data?.error?.message ||
                    "Gemini API trả về lỗi."
            });
        }

        const reply =
            data?.candidates?.[0]?.content?.parts
                ?.map(part => part.text || "")
                .join("")
                .trim();

        if (!reply) {
            return res.status(500).json({
                error: "Gemini không trả về câu trả lời."
            });
        }

        return res.status(200).json({
            reply: reply
        });

    } catch (error) {
        console.error(error);

        return res.status(500).json({
            error: "Lỗi máy chủ: " + error.message
        });
    }
          }
