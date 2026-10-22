import { router } from 'expo-router';

export const openCollection = (id: string) => router.push({ pathname: '/collection/[id]', params: { id } });
export const openArtist = (name: string) => router.push({ pathname: '/artist/[name]', params: { name } });
