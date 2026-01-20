import { connectSocket } from '@/src/socket/connect';
import { registerPvPSocketListeners } from '@/src/socket/registerListeners';
import { Redirect } from 'expo-router';
import { useEffect } from 'react';

export default function Index() {
  useEffect(() => {
    connectSocket();
    registerPvPSocketListeners();
  }, []);
  
  return <Redirect href="/(auth)/login" />;
}
