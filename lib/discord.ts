type DiscordField = {
  name: string;
  value: string;
  inline?: boolean;
};

type DiscordEmbed = {
  title: string;
  description?: string;
  color?: number;
  fields?: DiscordField[];
  footer?: {
    text: string;
  };
  timestamp?: string;
};

export async function sendDiscordNotification(embed: DiscordEmbed) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn("DISCORD_WEBHOOK_URL is missing");
    return {
      success: false,
      error: "DISCORD_WEBHOOK_URL is missing",
    };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "الأمين للأقساط",
        avatar_url: "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
        embeds: [
          {
            ...embed,
            timestamp: embed.timestamp || new Date().toISOString(),
            footer: embed.footer || {
              text: "Al Ameen Finance System",
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();

      console.error("Discord webhook failed:", text);

      return {
        success: false,
        error: text,
      };
    }

    return {
      success: true,
      error: null,
    };
  } catch (error) {
    console.error("Discord notification error:", error);

    return {
      success: false,
      error: String(error),
    };
  }
}

export function jod(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const numberValue = Number(value);

  if (Number.isNaN(numberValue)) {
    return String(value);
  }

  return `${numberValue.toFixed(2)} د.أ`;
}