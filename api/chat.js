
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Gunakan metode POST."
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || !apiKey.trim()) {
    console.error("Smile AI: GEMINI_API_KEY tidak tersedia.");
    return res.status(500).json({
      error: "API key belum dipasang di Vercel."
    });
  }

  try {
    const body = req.body || {};
    const message = body.message;
    const history = body.history;

    if (
      typeof message !== "string" ||
      !message.trim() ||
      message.length > 4000
    ) {
      return res.status(400).json({
        error: "Pesan wajib diisi dan maksimal 4000 karakter."
      });
    }

    const safeHistory = Array.isArray(history)
      ? history
          .slice(-20)
          .filter(
            (m) =>
              m &&
              ["user", "model"].includes(m.role) &&
              typeof m.text === "string"
          )
          .map((m) => ({
            role: m.role,
            parts: [{ text: m.text.slice(0, 4000) }]
          }))
      : [];

    const contents = [
      ...safeHistory,
      {
        role: "user",
        parts: [{ text: message.trim() }]
      }
    ];

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey.trim()
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [
              {
                text:
                  "Kamu adalah Smile AI, asisten AI yang ramah. " +
                  "Bantu pengguna belajar, coding, menulis, " +
                  "membuat ide, dan memecahkan masalah. " +
                  "Jawab menggunakan bahasa pengguna. " +
                  "Berikan kode yang jelas dan aman."
              }
            ]
          },
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048
          }
        })
      }
    );

    const raw = await response.text();
    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      data = {};
    }

    if (!response.ok) {
      const apiError = data.error || {};

      // Detail ini muncul di Vercel Logs, bukan ke pengguna.
      console.error("Gemini API gagal:", JSON.stringify({
        httpStatus: response.status,
        errorStatus: apiError.status || "UNKNOWN",
        message: apiError.message || "Tidak ada detail dari API"
      }));

      let messageToUser =
        "Gemini gagal memproses permintaan. Periksa Vercel Logs.";

      if (response.status === 400) {
        messageToUser =
          "Permintaan ditolak Gemini. Periksa format pesan atau riwayat chat.";
      } else if (response.status === 401 || response.status === 403) {
        messageToUser =
          "Akses Gemini ditolak. Periksa API key dan izin API.";
      } else if (response.status === 404) {
        messageToUser =
          "Model Gemini tidak ditemukan atau tidak tersedia untuk API ini.";
      } else if (response.status === 429) {
        messageToUser =
          "Batas penggunaan Gemini tercapai. Periksa kuota dan limit API.";
      }

      return res.status(502).json({
        error: messageToUser
      });
    }

    const reply = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim();

    if (!reply) {
      console.error(
        "Gemini tidak mengembalikan teks:",
        JSON.stringify({
          finishReason: data.candidates?.[0]?.finishReason || "UNKNOWN",
          promptFeedback: data.promptFeedback || null
        })
      );

      return res.status(502).json({
        error: "Gemini tidak memberikan jawaban. Coba pesan lain."
      });
    }

    return res.status(200).json({ reply });
  } catch (error) {
    console.error("Smile AI server error:", error.message);

    return res.status(500).json({
      error: "Server Smile AI bermasalah. Periksa Vercel Logs."
    });
  }
};
