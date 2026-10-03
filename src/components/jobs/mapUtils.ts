import type { JobMapPin } from '../../types/job';

export const pinKey = (pin: Pick<JobMapPin, 'longitude' | 'latitude'>) => `${pin.longitude}:${pin.latitude}`;
