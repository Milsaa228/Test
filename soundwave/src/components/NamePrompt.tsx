import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Sheet } from './Sheet';
import { colors } from './theme';

type Props = {
  visible: boolean;
  title: string;
  initial?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onSubmit: (name: string) => void;
};

/** Ввод названия плейлиста (Alert.prompt есть только на iOS). */
export function NamePrompt({ visible, onCancel, ...rest }: Props) {
  return (
    <Sheet visible={visible} onClose={onCancel}>
      {/* Тело монтируется заново при каждом открытии, поэтому поле стартует с initial. */}
      {visible && <PromptBody onCancel={onCancel} {...rest} />}
    </Sheet>
  );
}

function PromptBody({ title, initial = '', confirmLabel = 'Создать', onCancel, onSubmit }: Omit<Props, 'visible'>) {
  const [name, setName] = useState(initial);
  return (
    <View style={styles.body}>
      <Text style={styles.title}>{title}</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        autoFocus
        placeholder="Название плейлиста"
        placeholderTextColor={colors.faint}
        style={styles.input}
        selectionColor={colors.accent}
        returnKeyType="done"
        onSubmitEditing={() => onSubmit(name)}
        maxLength={60}
      />
      <View style={styles.buttons}>
        <Pressable onPress={onCancel} style={[styles.btn, styles.secondary]}>
          <Text style={styles.secondaryText}>Отмена</Text>
        </Pressable>
        <Pressable onPress={() => onSubmit(name)} style={[styles.btn, styles.primary]}>
          <Text style={styles.primaryText}>{confirmLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingBottom: 8 },
  title: { color: colors.text, fontSize: 20, fontWeight: '700', textAlign: 'center', marginVertical: 12 },
  input: { color: colors.text, fontSize: 22, fontWeight: '600', textAlign: 'center', borderBottomWidth: 1, borderColor: colors.faint, paddingVertical: 10, marginBottom: 24 },
  buttons: { flexDirection: 'row', gap: 12, justifyContent: 'center' },
  btn: { borderRadius: 24, paddingHorizontal: 28, paddingVertical: 12 },
  primary: { backgroundColor: colors.accent },
  primaryText: { color: colors.accentText, fontWeight: '700', fontSize: 15 },
  secondary: { borderWidth: 1, borderColor: colors.faint },
  secondaryText: { color: colors.text, fontWeight: '600', fontSize: 15 },
});
