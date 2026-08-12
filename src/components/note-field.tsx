/**
 * Notes field for an entry form — the note input plus its attachments.
 *
 * A small paperclip icon sits at the right edge of the input; tapping it offers
 * Take Photo / Add Photo / Add PDF. Attached files render as chips (thumbnail for images,
 * FileText + name for PDFs) beneath the input — tap a chip to view, ✕ to remove.
 *
 * Crash-safe by construction: every pick/compress is wrapped so a bad file
 * toasts instead of crashing, size caps are enforced with a friendly message,
 * and a missing local file (synced metadata without the bytes) toasts instead
 * of throwing.
 */
import { Camera, FileText, ImagePlus, Paperclip, Share, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { feedback } from '@/components/feedback';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { InterFonts, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AttachmentMeta } from '@/types';
import {
  attachmentFileUri,
  MAX_ATTACHMENTS,
  openAttachment,
  pickAttachment,
  removeAttachmentFiles,
  type AttachmentPickKind,
} from '@/utils/attachments';

type NoteFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  accessibilityLabel?: string;
  attachments: AttachmentMeta[];
  onChangeAttachments: (next: AttachmentMeta[]) => void;
};

export function NoteField({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  attachments,
  onChangeAttachments,
}: NoteFieldProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<AttachmentPickKind | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);

  const pick = async (kind: AttachmentPickKind) => {
    setBusy(kind);
    try {
      const meta = await pickAttachment(kind);
      if (meta) {
        onChangeAttachments([...attachments, meta]);
      }
    } catch (error) {
      feedback.toast({
        message: error instanceof Error ? error.message : 'Could not add the attachment.',
        tone: 'error',
      });
    } finally {
      setBusy(null);
    }
  };

  const attach = () => {
    if (attachments.length >= MAX_ATTACHMENTS) {
      feedback.toast({
        message: `You can attach up to ${MAX_ATTACHMENTS} files.`,
        tone: 'info',
      });
      return;
    }
    feedback.sheet({
      title: 'Add attachment',
      options: [
        { label: 'Take Photo', icon: Camera, onPress: () => void pick('camera') },
        { label: 'Add Photo', icon: ImagePlus, onPress: () => void pick('image') },
        { label: 'Add PDF', icon: FileText, onPress: () => void pick('pdf') },
      ],
    });
  };

  const remove = (meta: AttachmentMeta) => {
    onChangeAttachments(attachments.filter((a) => a.id !== meta.id));
    // Best-effort: deleting the file now leaves the DB untouched until Save, so
    // a cancel-after-remove just shows a dead chip — never a crash.
    void removeAttachmentFiles([meta]);
  };

  const open = async (meta: AttachmentMeta, index: number) => {
    if (meta.kind === 'image') {
      if (!attachmentFileUri(meta)) {
        feedback.toast({ message: 'Attachment not available on this device.', tone: 'info' });
        return;
      }
      setViewer(index);
      return;
    }
    // PDFs open via the share sheet / system viewer (no in-app renderer).
    const opened = await openAttachment(meta);
    if (!opened) {
      feedback.toast({ message: 'Attachment not available on this device.', tone: 'info' });
    }
  };

  const viewerMeta = viewer != null ? attachments[viewer] : null;

  return (
    <>
      <TextField
        label="Note (optional)"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        accessibilityLabel={accessibilityLabel}
        rightIcon={
          <Pressable
            onPress={attach}
            disabled={busy !== null}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Add attachment"
            style={({ pressed }) => [
              styles.trigger,
              pressed && styles.pressed,
              busy !== null && styles.disabled,
            ]}>
            {busy ? (
              <ActivityIndicator size="small" color={theme.textSecondary} />
            ) : (
              <Paperclip size={20} color={theme.textSecondary} />
            )}
          </Pressable>
        }
      />

      {attachments.length > 0 ? (
        <View style={styles.chips}>
          {attachments.map((meta, index) => {
            const uri = attachmentFileUri(meta);
            return (
              <Pressable
                key={meta.id}
                onPress={() => void open(meta, index)}
                accessibilityRole="button"
                accessibilityLabel={`Open attachment ${meta.name}`}
                style={({ pressed }) => [
                  styles.chip,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                  pressed && styles.pressed,
                ]}>
                {meta.kind === 'image' && uri ? (
                  <Image source={{ uri }} style={styles.thumb} accessibilityIgnoresInvertColors />
                ) : (
                  <FileText size={18} color={theme.textSecondary} />
                )}
                <ThemedText
                  type="small"
                  numberOfLines={1}
                  style={styles.chipName}>
                  {meta.name}
                </ThemedText>
                <Pressable
                  onPress={() => remove(meta)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${meta.name}`}
                  style={styles.removeHit}>
                  <X size={16} color={theme.textSecondary} />
                </Pressable>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {/* In-app viewer for images. PDFs never get here — they open externally. */}
      <Modal
        visible={viewerMeta != null}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setViewer(null)}>
        <View style={[styles.viewer, { backgroundColor: theme.overlay }]}>
          {viewerMeta ? (
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setViewer(null)}
              accessibilityLabel="Close viewer"
            />
          ) : null}
          {viewerMeta?.kind === 'image' ? (
            <Image
              source={{ uri: attachmentFileUri(viewerMeta) ?? undefined }}
              style={styles.viewerImage}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          ) : null}
          <View
            style={[
              styles.viewerActions,
              { top: insets.top + Spacing.two, right: Spacing.three },
            ]}>
            {viewerMeta ? (
              <ViewerButton
                icon={Share}
                label="Share"
                onPress={() => void openAttachment(viewerMeta)}
                background={theme.card}
                color={theme.text}
              />
            ) : null}
            <ViewerButton
              icon={X}
              label="Close"
              onPress={() => setViewer(null)}
              background={theme.card}
              color={theme.text}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

function ViewerButton({
  icon: Icon,
  label,
  onPress,
  background,
  color,
}: {
  icon: typeof X;
  label: string;
  onPress: () => void;
  background: string;
  color: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.viewerButton,
        { backgroundColor: background },
        pressed && styles.pressed,
      ]}>
      <Icon size={22} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  trigger: {
    width: 32,
    height: 32,
    borderRadius: Radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.chip,
    paddingLeft: Spacing.one,
    paddingRight: Spacing.two,
    paddingVertical: Spacing.one,
    maxWidth: '100%',
  },
  chipName: {
    fontFamily: InterFonts.medium,
    fontSize: 13,
    flexShrink: 1,
    maxWidth: 160,
  },
  thumb: {
    width: 34,
    height: 34,
    borderRadius: Radius.card,
  },
  removeHit: {
    padding: Spacing.one,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
  viewer: {
    flex: 1,
    justifyContent: 'center',
  },
  viewerImage: {
    width: '100%',
    height: '100%',
  },
  viewerActions: {
    position: 'absolute',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  viewerButton: {
    width: 48,
    height: 48,
    borderRadius: Radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
