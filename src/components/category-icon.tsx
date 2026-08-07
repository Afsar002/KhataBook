/** Maps a stored category icon name to a Lucide icon component. */
import {
  Briefcase,
  Car,
  CircleMinus,
  CirclePlus,
  HeartPulse,
  Home,
  ShoppingBag,
  Store,
  Tag,
  Utensils,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react-native';

const ICONS: Record<string, LucideIcon> = {
  briefcase: Briefcase,
  car: Car,
  'circle-minus': CircleMinus,
  'circle-plus': CirclePlus,
  'heart-pulse': HeartPulse,
  home: Home,
  'shopping-bag': ShoppingBag,
  store: Store,
  tag: Tag,
  utensils: Utensils,
};

type CategoryIconProps = LucideProps & {
  name: string | null | undefined;
};

export function CategoryIcon({ name, ...props }: CategoryIconProps) {
  const Icon = (name && ICONS[name]) || Tag;
  return <Icon {...props} />;
}
