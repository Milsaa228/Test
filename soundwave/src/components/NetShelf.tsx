import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import type { NetItem } from '../lib/archive';
import { cached } from '../lib/cache';
import { colorsFor } from '../lib/library';
import { shelfItems } from '../lib/reco';
import { MediaCard, Shelf } from './Shelf';
import { colors } from './theme';

const DAY = 24 * 3600 * 1000;

/** Полка записей Internet Archive по жанру или исполнителю; список кэшируется на сутки. */
export function NetShelf({ title, kind, value }: { title: string; kind: 'genre' | 'artist'; value: string }) {
  const [items, setItems] = useState<NetItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    cached(`shelf:${kind}:${value}`, DAY, () => shelfItems({ kind, value }))
      .then((list) => alive && setItems(list))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [kind, value]);

  if (failed || (items && !items.length)) return null;
  return (
    <Shelf title={title}>
      {items ? (
        items.map((it) => (
          <MediaCard
            key={it.id}
            title={it.title}
            subtitle={it.creator}
            colors={colorsFor(it.id)}
            icon="globe"
            onPress={() => router.push({ pathname: '/net/[id]', params: { id: it.id } })}
          />
        ))
      ) : (
        <View style={{ width: 140, height: 140, justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      )}
    </Shelf>
  );
}
