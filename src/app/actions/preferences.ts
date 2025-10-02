'use server';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { WeightConfig, EngineType } from '@/types/collision-detection';

/**
 * Creates a Supabase client for server-side operations with admin privileges.
 * @returns Supabase client with service role access
 */
function getSupabaseAdmin() {
  const cookieStore = cookies();
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
}

// Type definitions for database operations
interface UserPreference {
  id: string;
  user_id: string;
  engine_weights: Record<EngineType, number>;
  normalization_method: 'linear' | 'sigmoid' | 'softmax';
  preset_name?: string | null;
  custom_presets?: CustomPreset[];
  last_modified: string;
  created_at: string;
}

interface CustomPreset {
  name: string;
  config: WeightConfig;
  created_at: string;
}

/**
 * Gets the current user's preferences with defaults if none exist.
 * @param userId - The user ID to get preferences for
 * @returns The user's weight configuration preferences
 */
export async function getUserPreferences(userId: string): Promise<WeightConfig> {
  const supabase = getSupabaseAdmin();
  
  try {
    // Use the database function that creates defaults if needed
    const { data, error } = await supabase
      .rpc('get_user_preferences', { p_user_id: userId })
      .single();
    
    if (error) {
      console.error('Error fetching user preferences:', error);
      throw new Error('Failed to fetch preferences');
    }
    
    // Transform database format to WeightConfig
    const preferences: WeightConfig = {
      weights: data.engine_weights as Record<EngineType, number>,
      normalizationMethod: data.normalization_method as 'linear' | 'sigmoid' | 'softmax',
    };
    
    return preferences;
  } catch (error) {
    console.error('Error in getUserPreferences:', error);
    // Return defaults on error
    return {
      weights: {
        [EngineType.SEMANTIC_SIMILARITY]: 0.25,
        [EngineType.STRUCTURAL_PATTERN]: 0.15,
        [EngineType.TEMPORAL_PROXIMITY]: 0.1,
        [EngineType.CONCEPTUAL_DENSITY]: 0.2,
        [EngineType.EMOTIONAL_RESONANCE]: 0.05,
        [EngineType.CITATION_NETWORK]: 0.15,
        [EngineType.CONTRADICTION_DETECTION]: 0.1,
      },
      normalizationMethod: 'linear',
    };
  }
}

/**
 * Updates the user's preference configuration.
 * @param userId - The user ID to update preferences for
 * @param config - The new weight configuration
 * @param presetName - Optional preset name if using a template
 * @returns The normalized weight configuration
 */
export async function updateUserPreferences(
  userId: string,
  config: WeightConfig,
  presetName?: string
): Promise<WeightConfig> {
  const supabase = getSupabaseAdmin();
  
  try {
    // Use the database function to validate and normalize weights
    const { data, error } = await supabase
      .rpc('update_engine_weights', {
        p_user_id: userId,
        p_weights: config.weights,
        p_normalization_method: config.normalizationMethod,
        p_preset_name: presetName || null,
      });
    
    if (error) {
      console.error('Error updating preferences:', error);
      throw new Error('Failed to update preferences');
    }
    
    // Return the normalized configuration
    return {
      weights: data as Record<EngineType, number>,
      normalizationMethod: config.normalizationMethod,
    };
  } catch (error) {
    console.error('Error in updateUserPreferences:', error);
    throw new Error('Failed to save preferences');
  }
}

/**
 * Saves a custom preset configuration for the user.
 * @param userId - The user ID
 * @param presetName - Name for the custom preset
 * @param config - The weight configuration to save
 * @returns Success status
 */
export async function saveCustomPreset(
  userId: string,
  presetName: string,
  config: WeightConfig
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  
  try {
    const { data, error } = await supabase
      .rpc('save_custom_preset', {
        p_user_id: userId,
        p_preset_name: presetName,
        p_preset_config: config,
      });
    
    if (error) {
      console.error('Error saving custom preset:', error);
      throw new Error('Failed to save preset');
    }
    
    return true;
  } catch (error) {
    console.error('Error in saveCustomPreset:', error);
    throw new Error('Failed to save custom preset');
  }
}

/**
 * Gets all custom presets for a user.
 * @param userId - The user ID
 * @returns Array of custom preset configurations
 */
export async function getCustomPresets(userId: string): Promise<CustomPreset[]> {
  const supabase = getSupabaseAdmin();
  
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('custom_presets')
      .eq('user_id', userId)
      .single();
    
    if (error && error.code !== 'PGRST116') { // Not found is ok
      console.error('Error fetching custom presets:', error);
      throw new Error('Failed to fetch presets');
    }
    
    return data?.custom_presets || [];
  } catch (error) {
    console.error('Error in getCustomPresets:', error);
    return [];
  }
}

/**
 * Deletes a custom preset for the user.
 * @param userId - The user ID
 * @param presetName - Name of the preset to delete
 * @returns Success status
 */
export async function deleteCustomPreset(
  userId: string,
  presetName: string
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  
  try {
    // Get current presets
    const { data: current, error: fetchError } = await supabase
      .from('user_preferences')
      .select('custom_presets')
      .eq('user_id', userId)
      .single();
    
    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching presets:', fetchError);
      throw new Error('Failed to fetch presets');
    }
    
    if (!current?.custom_presets) {
      return true; // Nothing to delete
    }
    
    // Filter out the preset to delete
    const updatedPresets = current.custom_presets.filter(
      (preset: CustomPreset) => preset.name !== presetName
    );
    
    // Update the database
    const { error: updateError } = await supabase
      .from('user_preferences')
      .update({ custom_presets: updatedPresets })
      .eq('user_id', userId);
    
    if (updateError) {
      console.error('Error deleting preset:', updateError);
      throw new Error('Failed to delete preset');
    }
    
    return true;
  } catch (error) {
    console.error('Error in deleteCustomPreset:', error);
    throw new Error('Failed to delete preset');
  }
}

/**
 * Resets user preferences to default values.
 * @param userId - The user ID
 * @returns The default weight configuration
 */
export async function resetUserPreferences(userId: string): Promise<WeightConfig> {
  const supabase = getSupabaseAdmin();
  
  const defaultWeights: WeightConfig = {
    weights: {
      [EngineType.SEMANTIC_SIMILARITY]: 0.25,
      [EngineType.STRUCTURAL_PATTERN]: 0.15,
      [EngineType.TEMPORAL_PROXIMITY]: 0.1,
      [EngineType.CONCEPTUAL_DENSITY]: 0.2,
      [EngineType.EMOTIONAL_RESONANCE]: 0.05,
      [EngineType.CITATION_NETWORK]: 0.15,
      [EngineType.CONTRADICTION_DETECTION]: 0.1,
    },
    normalizationMethod: 'linear',
  };
  
  try {
    const { error } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: userId,
        engine_weights: defaultWeights.weights,
        normalization_method: defaultWeights.normalizationMethod,
        preset_name: null,
      });
    
    if (error) {
      console.error('Error resetting preferences:', error);
      throw new Error('Failed to reset preferences');
    }
    
    return defaultWeights;
  } catch (error) {
    console.error('Error in resetUserPreferences:', error);
    throw new Error('Failed to reset preferences');
  }
}

/**
 * Gets preference statistics across all users (admin only).
 * @returns Statistics about preference usage
 */
export async function getPreferenceStatistics(): Promise<{
  totalUsers: number;
  presetUsage: Record<string, number>;
  averageWeights: Record<EngineType, number>;
}> {
  const supabase = getSupabaseAdmin();
  
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('preset_name, engine_weights');
    
    if (error) {
      console.error('Error fetching statistics:', error);
      throw new Error('Failed to fetch statistics');
    }
    
    const totalUsers = data?.length || 0;
    const presetUsage: Record<string, number> = {};
    const weightSums: Record<EngineType, number> = {
      [EngineType.SEMANTIC_SIMILARITY]: 0,
      [EngineType.STRUCTURAL_PATTERN]: 0,
      [EngineType.TEMPORAL_PROXIMITY]: 0,
      [EngineType.CONCEPTUAL_DENSITY]: 0,
      [EngineType.EMOTIONAL_RESONANCE]: 0,
      [EngineType.CITATION_NETWORK]: 0,
      [EngineType.CONTRADICTION_DETECTION]: 0,
    };
    
    // Calculate statistics
    data?.forEach((pref) => {
      // Count preset usage
      const preset = pref.preset_name || 'custom';
      presetUsage[preset] = (presetUsage[preset] || 0) + 1;
      
      // Sum weights for averaging
      Object.entries(pref.engine_weights as Record<EngineType, number>).forEach(
        ([engine, weight]) => {
          weightSums[engine as EngineType] += weight;
        }
      );
    });
    
    // Calculate averages
    const averageWeights: Record<EngineType, number> = {} as Record<EngineType, number>;
    Object.entries(weightSums).forEach(([engine, sum]) => {
      averageWeights[engine as EngineType] = totalUsers > 0 ? sum / totalUsers : 0;
    });
    
    return {
      totalUsers,
      presetUsage,
      averageWeights,
    };
  } catch (error) {
    console.error('Error in getPreferenceStatistics:', error);
    throw new Error('Failed to fetch statistics');
  }
}