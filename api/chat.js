
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Gunakan metode POST."
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "API key belum dipasang di pengaturan server."
    });
  }

  try {
    const { message, history = [] } = req.body || {};

    if (typeof message !== "string" ||
        !message.trim() || message.length > 4000) {
      return res.status(400).json({
        error: "Pesan wajib diisi dan maksimal 4000 karakter."
      });
    }

    const safeHistory = Array.isArray(history)
      ? history.slice(-20)
          .filter(m =>
            m &&
            ["user", "model"].includes(m.role) &&
            typeof m.text === "string"
          )
          .map(m => ({
            role: m.role,
            parts: [{ text: m.text.slice(0, 4000) }]
          }))
      : [];

    const contents = [
      ...safeHistory,
      { role: "user", parts: [{ text: message.trim() }] }
    ];

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{
              text: "Kamu adalah Smile AI, asisten AI yang ramah, " +
                "membantu pengguna belajar, coding, menulis, " +
                "membuat ide, dan memecahkan masalah. " +
                "Jawab dalam bahasa yang digunakan pengguna. " +
                "Untuk kode, berikan contoh yang jelas dan aman."
            }]
          },
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API status:", response.status);
      return res.status(502).json({
        error: "Layanan AI bermasalah. Periksa model, kuota, " +
          "dan pengaturan API key."
      });
    }

    const reply = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

    if (!reply) {
      return res.status(502).json({
        error: "AI belum memberikan jawaban. Coba lagi."
      });
    }

    return res.status(200).json({ reply });
  } catch (error) {
    console.error("Smile AI server error:", error.message);
    return res.status(500).json({
      error: "Terjadi kesalahan pada server."
    });
  }
};
