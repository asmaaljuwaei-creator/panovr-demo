'use client';

import { useLineOfSight } from './useLineOfSight';

/**
 * Line of Sight analysis tool component
 * Handles the analysis logic when mode is active
 */
export const LineOfSightTool = () => {
    useLineOfSight();
    return null; // This component has no UI, it just handles the analysis
};
