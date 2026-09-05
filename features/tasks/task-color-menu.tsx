import { Check } from 'lucide-react';

import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import type { TaskColor } from '@/lib/data';

const taskColors: Array<{
  value?: TaskColor;
  label: string;
  className: string;
}> = [
  { label: 'Без цвета', className: 'none' },
  { value: 'blue', label: 'Голубой', className: 'blue' },
  { value: 'yellow', label: 'Жёлтый', className: 'yellow' },
  { value: 'purple', label: 'Фиолетовый', className: 'purple' },
  { value: 'rose', label: 'Розовый', className: 'rose' },
];

export function TaskColorMenu({
  color,
  onChange,
  label = 'Цвет',
}: {
  color?: TaskColor;
  onChange: (color?: TaskColor) => void;
  label?: string;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <span className={`task-color-dot ${color ?? 'none'}`} />
        {label}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="task-color-menu">
        {taskColors.map((option) => (
          <DropdownMenuItem
            key={option.className}
            onClick={() => onChange(option.value)}
          >
            <span className={`task-color-dot ${option.className}`} />
            {option.label}
            {color === option.value && <Check className="task-color-check" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
