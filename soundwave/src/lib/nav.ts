import { router } from 'expo-router';

export const openCollection = (id: string) => router.push({ pathname: '/collection/[id]', params: { id } });
