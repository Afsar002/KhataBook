/**
 * Category management — add, rename and delete income/expense categories.
 *
 * Deleting a category keeps its transactions (their `category_id` becomes null
 * via the `ON DELETE SET NULL` foreign key), so recorded amounts are never
 * lost. Categories are synced, so changes reach the cloud on the next push.
 */
import { router, useFocusEffect } from 'expo-router';
import { ChevronLeft, Pencil, Plus, Trash2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/card';
import { CategoryIcon } from '@/components/category-icon';
import { EmptyState } from '@/components/empty-state';
import { IconPicker } from '@/components/icon-picker';
import { LargeButton } from '@/components/large-button';
import { Screen } from '@/components/screen';
import { Segment } from '@/components/segment';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import {
  addCategory,
  deleteCategory,
  listAllCategories,
  updateCategory,
} from '@/db/category-repo';
import { useTheme } from '@/hooks/use-theme';
import type { Category, TransactionType } from '@/types';
import { confirmDelete } from '@/utils/confirm';

export default function CategoriesScreen() {
  const theme = useTheme();
  const [type, setType] = useState<TransactionType>('expense');
  const [categories, setCategories] = useState<Category[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('tag');

  const refresh = useCallback(async () => {
    setCategories(await listAllCategories());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const list = categories.filter((category) => category.type === type);

  const startAdd = () => {
    setEditing(null);
    setName('');
    setIcon('tag');
    setFormOpen(true);
  };

  const startEdit = (category: Category) => {
    setEditing(category);
    setName(category.name);
    setIcon(category.icon);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    if (editing) {
      await updateCategory(editing.id, { name: trimmed, icon });
    } else {
      await addCategory({ name: trimmed, type, icon });
    }
    closeForm();
    void refresh();
  };

  const remove = (category: Category) => {
    confirmDelete(
      'Delete category?',
      'Entries already recorded will keep their amounts, without this category.',
      () => {
        void deleteCategory(category.id).then(() => {
          if (editing?.id === category.id) {
            closeForm();
          }
          void refresh();
        });
      }
    );
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.back}>
          <ChevronLeft size={28} color={theme.text} />
        </Pressable>
        <ThemedText type="subtitle">Categories</ThemedText>
      </View>

      <Segment
        options={[
          { key: 'expense', label: 'Expense' },
          { key: 'income', label: 'Income' },
        ]}
        value={type}
        onChange={(key) => setType(key as TransactionType)}
      />

      {list.length === 0 ? (
        <EmptyState
          type="categories"
          title="No categories yet"
          message="Add a category to organise your entries."
        />
      ) : (
        <Card pad={false}>
          {list.map((category) => (
            <View key={category.id} style={styles.row}>
              <View style={[styles.rowIcon, { backgroundColor: theme.backgroundElement }]}>
                <CategoryIcon name={category.icon} size={20} color={theme.text} />
              </View>
              <ThemedText type="default" style={styles.rowName} numberOfLines={1}>
                {category.name}
              </ThemedText>
              <Pressable
                onPress={() => startEdit(category)}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${category.name}`}
                hitSlop={8}
                style={styles.rowButton}>
                <Pencil size={18} color={theme.textSecondary} />
              </Pressable>
              <Pressable
                onPress={() => remove(category)}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${category.name}`}
                hitSlop={8}
                style={styles.rowButton}>
                <Trash2 size={18} color={theme.expense} />
              </Pressable>
            </View>
          ))}
        </Card>
      )}

      {formOpen ? (
        <Card style={styles.form}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {editing ? 'Edit category' : 'New category'}
          </ThemedText>
          <TextField
            label="Name"
            placeholder="e.g. Groceries"
            value={name}
            onChangeText={setName}
            autoFocus
            accessibilityLabel="Category name"
          />
          <ThemedText type="smallBold" themeColor="textSecondary">
            Icon
          </ThemedText>
          <IconPicker value={icon} onChange={setIcon} />
          <LargeButton title={editing ? 'Save changes' : 'Add category'} onPress={save} />
          <LargeButton title="Cancel" variant="outline" onPress={closeForm} />
        </Card>
      ) : (
        <LargeButton title="Add Category" icon={Plus} onPress={startAdd} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  back: {
    paddingVertical: Spacing.one,
    paddingRight: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowName: {
    flex: 1,
  },
  rowButton: {
    padding: Spacing.one,
  },
  form: {
    gap: Spacing.three,
  },
});
