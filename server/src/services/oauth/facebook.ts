import axios from 'axios';

export async function verifyFacebookAccessToken(accessToken: string) {
  const appId = process.env.FACEBOOK_APP_ID!;
  const appSecret = process.env.FACEBOOK_APP_SECRET!;
  const appAccessToken = `${appId}|${appSecret}`;

  // 1) debug token
  const debug = await axios.get('https://graph.facebook.com/debug_token', {
    params: { input_token: accessToken, access_token: appAccessToken },
  });

  const data = debug.data?.data;
  if (!data?.is_valid) throw new Error('Invalid Facebook token');
  if (data?.app_id !== appId) throw new Error('Token not for this app');

  // 2) get profile
  const profile = await axios.get('https://graph.facebook.com/me', {
    params: {
      access_token: accessToken,
      fields: 'id,name,email,picture.type(large)',
    },
  });

  const p = profile.data;
  if (!p?.id) throw new Error('Invalid Facebook profile');

  return {
    providerId: p.id,
    email: p.email ?? `fb_${p.id}@pulsequiz.local`, // fallback if FB doesn't provide email
    name: p.name ?? '',
    picture: p.picture?.data?.url ?? '',
  };
}
