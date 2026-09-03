import { Link } from 'react-router-dom';
import type { MenuItem } from '../../types';

const moods = [
  { id: 'pizza', label: 'Pizza', query: 'cat=pizza' },
  { id: 'burgers', label: 'Burgers', query: 'cat=burgers' },
  { id: 'family-packs', label: 'Family Packs', query: 'cat=family-packs' },
  { id: 'momos', label: 'Momos', query: 'cat=momos' },
  { id: 'speciality-chicken', label: 'Chicken', query: 'cat=speciality-chicken' },
  { id: 'desserts', label: 'Desserts', query: 'cat=desserts' },
  { id: 'pasta', label: 'Pasta', query: 'cat=pasta' },
  { id: 'garlic-bread', label: 'Garlic Bread', query: 'cat=garlic-bread' },
];

interface FoodMoodCardsProps {
  items: MenuItem[];
}

export default function FoodMoodCards({ items }: FoodMoodCardsProps) {
  const representativeImages = moods.map((mood) => {
    const match = items.find((i) => i.category === mood.id);
    return { ...mood, image: match?.image || '' };
  });

  return (
    <div>
      <h2 className="text-lg sm:text-xl font-heading font-bold mb-4">What's on your mind?</h2>
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-3">
        {representativeImages.map((mood) => (
          <Link
            key={mood.id}
            to={`/r/menu?${mood.query}`}
            className="flex flex-col items-center gap-2.5 group"
          >
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden border-2 border-stone-100 group-hover:border-brand-300 group-hover:shadow-md transition-all duration-200">
              {mood.image ? (
                <img
                  src={mood.image}
                  alt={mood.label}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full bg-stone-100 flex items-center justify-center text-zinc-400 text-lg font-bold">
                  {mood.label.charAt(0)}
                </div>
              )}
            </div>
            <span className="text-xs font-medium text-zinc-700 text-center leading-tight">{mood.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
