import fetch from 'node-fetch';
import zlib from 'zlib';

const webhookUrl = process.env.SLACK_WEBHOOK_URL;

const sendMessageToSlack = async (webhookUrl, message) => {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: message }),
  });

  if (!response.ok) {
    throw new Error(`Error: ${response.status}`);
  }

  return response;
};

export const handler = async (event) => {
  const payload = Buffer.from(event.awslogs.data, 'base64');
  const parsed = JSON.parse(zlib.gunzipSync(payload).toString('utf8'));
  console.log('Decoded payload:', parsed);

  for (let logEvent of parsed.logEvents) {
    if (logEvent.message.includes('error')) {
      await sendMessageToSlack(webhookUrl, logEvent.message);
    }
  }
};
