import { Badge } from './ui';
import { Card, CardContent, CardHeader, CardTitle } from './ui';

import { cn } from '../lib/utils';
import { TrendingUpIcon, MinusIcon, TrendingDownIcon, ShieldAlertIcon } from 'lucide-react';

const statusConfig = {
  within: {
    color: 'bg-green-600/10 dark:bg-green-400/10 text-green-600 dark:text-green-400',
    icon: (
      <TrendingUpIcon />
    ),
    label: 'On Track'
  },
  observe: {
    color: 'bg-amber-600/10 dark:bg-amber-400/10 text-amber-600 dark:text-amber-400',
    icon: (
      <MinusIcon />
    ),
    label: 'Stable'
  },
  exceed: {
    color: 'bg-destructive/10 text-destructive',
    icon: (
      <TrendingDownIcon />
    ),
    label: 'At Risk'
  },
  unknown: {
    color: 'bg-sky-600/10 dark:bg-sky-400/10 text-sky-600 dark:text-sky-400',
    icon: (
      <ShieldAlertIcon />
    ),
    label: 'Under Review'
  }
};

const StatisticsWithStatus = ({ status, value, title, className, range, icon }) => {
  return (
    <Card className={cn('flex flex-col gap-3', className)}>
      <CardHeader className='flex items-center justify-between'>
        <CardTitle className='text-sm font-semibold'>{title}</CardTitle>
        {icon && (
          <div className='bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-sm [&>svg]:size-4'>
            {icon}
          </div>
        )}
      </CardHeader>

      <CardContent className='flex flex-col gap-3'>
        <p className='text-3xl font-semibold tracking-tight'>{value}</p>

        <Badge className={cn(statusConfig[status].color, 'gap-1.5 [&>svg]:size-3.5!')}>
          {statusConfig[status].icon}
          <span>{statusConfig[status].label}:</span>
          <span>{range}</span>
        </Badge>
      </CardContent>
    </Card>
  );
};

export default StatisticsWithStatus;
