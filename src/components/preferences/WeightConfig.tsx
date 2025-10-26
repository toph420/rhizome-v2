'use client';

/**
 * Weight configuration component for the 7-engine collision detection system.
 * Allows users to adjust engine weights to customize connection discovery.
 */

import React, { useState, useEffect } from 'react';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/rhizome/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Brain, 
  Network, 
  Clock, 
  Layers, 
  Heart, 
  BookOpen, 
  AlertCircle,
  RotateCcw,
  Save,
} from 'lucide-react';
import { EngineType, DEFAULT_WEIGHTS } from '@/types/collision-detection';
import type { WeightConfig } from '@/types/collision-detection';

interface WeightConfigProps {
  initialWeights?: WeightConfig;
  onSave: (weights: WeightConfig) => Promise<void>;
  onReset?: () => void;
}

// Engine metadata for UI
const engineInfo = {
  [EngineType.SEMANTIC_SIMILARITY]: {
    name: 'Semantic Similarity',
    description: 'Finds conceptually related content using AI embeddings',
    icon: Brain,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  [EngineType.STRUCTURAL_PATTERN]: {
    name: 'Structural Patterns',
    description: 'Identifies similarly organized content structures',
    icon: Network,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
  },
  [EngineType.TEMPORAL_PROXIMITY]: {
    name: 'Temporal Proximity',
    description: 'Discovers time-based connections and patterns',
    icon: Clock,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
  [EngineType.CONCEPTUAL_DENSITY]: {
    name: 'Conceptual Density',
    description: 'Locates knowledge-rich areas with concept overlap',
    icon: Layers,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
  },
  [EngineType.EMOTIONAL_RESONANCE]: {
    name: 'Emotional Resonance',
    description: 'Finds emotionally aligned or contrasting content',
    icon: Heart,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
  },
  [EngineType.CITATION_NETWORK]: {
    name: 'Citation Networks',
    description: 'Maps reference-based scholarly connections',
    icon: BookOpen,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
  },
  [EngineType.CONTRADICTION_DETECTION]: {
    name: 'Contradiction Detection',
    description: 'Identifies conflicting information and inconsistencies',
    icon: AlertCircle,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
  },
};

// Preset configurations
const presets = {
  balanced: {
    name: 'Balanced',
    description: 'Equal weight to all engines',
    weights: {
      [EngineType.SEMANTIC_SIMILARITY]: 0.143,
      [EngineType.STRUCTURAL_PATTERN]: 0.143,
      [EngineType.TEMPORAL_PROXIMITY]: 0.143,
      [EngineType.CONCEPTUAL_DENSITY]: 0.143,
      [EngineType.EMOTIONAL_RESONANCE]: 0.143,
      [EngineType.CITATION_NETWORK]: 0.143,
      [EngineType.CONTRADICTION_DETECTION]: 0.143,
    },
  },
  academic: {
    name: 'Academic',
    description: 'Focus on citations and concepts',
    weights: {
      [EngineType.SEMANTIC_SIMILARITY]: 0.2,
      [EngineType.STRUCTURAL_PATTERN]: 0.1,
      [EngineType.TEMPORAL_PROXIMITY]: 0.05,
      [EngineType.CONCEPTUAL_DENSITY]: 0.25,
      [EngineType.EMOTIONAL_RESONANCE]: 0.05,
      [EngineType.CITATION_NETWORK]: 0.3,
      [EngineType.CONTRADICTION_DETECTION]: 0.05,
    },
  },
  narrative: {
    name: 'Narrative',
    description: 'Emphasis on emotional and temporal connections',
    weights: {
      [EngineType.SEMANTIC_SIMILARITY]: 0.15,
      [EngineType.STRUCTURAL_PATTERN]: 0.15,
      [EngineType.TEMPORAL_PROXIMITY]: 0.25,
      [EngineType.CONCEPTUAL_DENSITY]: 0.1,
      [EngineType.EMOTIONAL_RESONANCE]: 0.25,
      [EngineType.CITATION_NETWORK]: 0.05,
      [EngineType.CONTRADICTION_DETECTION]: 0.05,
    },
  },
  analytical: {
    name: 'Analytical',
    description: 'Focus on contradictions and deep analysis',
    weights: {
      [EngineType.SEMANTIC_SIMILARITY]: 0.2,
      [EngineType.STRUCTURAL_PATTERN]: 0.15,
      [EngineType.TEMPORAL_PROXIMITY]: 0.1,
      [EngineType.CONCEPTUAL_DENSITY]: 0.2,
      [EngineType.EMOTIONAL_RESONANCE]: 0.05,
      [EngineType.CITATION_NETWORK]: 0.1,
      [EngineType.CONTRADICTION_DETECTION]: 0.2,
    },
  },
};

export function WeightConfig({ initialWeights = DEFAULT_WEIGHTS, onSave, onReset }: WeightConfigProps) {
  const [weights, setWeights] = useState<WeightConfig>(initialWeights);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  // Check if weights have changed
  useEffect(() => {
    const changed = JSON.stringify(weights) !== JSON.stringify(initialWeights);
    setHasChanges(changed);
  }, [weights, initialWeights]);

  // Update individual weight
  const handleWeightChange = (engineType: EngineType, value: number[]) => {
    const newValue = value[0];
    const currentWeights = { ...weights.weights };
    const oldValue = currentWeights[engineType];
    
    // Calculate difference
    const diff = newValue - oldValue;
    const otherEngines = Object.keys(currentWeights).filter(e => e !== engineType) as EngineType[];
    const adjustment = -diff / otherEngines.length;
    
    // Adjust other weights proportionally to maintain sum of 1
    const newWeights = { ...currentWeights };
    newWeights[engineType] = newValue;
    
    otherEngines.forEach(engine => {
      newWeights[engine] = Math.max(0, Math.min(1, currentWeights[engine] + adjustment));
    });
    
    // Normalize to ensure sum is exactly 1
    const sum = Object.values(newWeights).reduce((a, b) => a + b, 0);
    Object.keys(newWeights).forEach(engine => {
      newWeights[engine as EngineType] /= sum;
    });
    
    setWeights({
      ...weights,
      weights: newWeights,
    });
    setSelectedPreset(null);
  };

  // Apply preset configuration
  const applyPreset = (presetKey: string) => {
    const preset = presets[presetKey as keyof typeof presets];
    if (preset) {
      setWeights({
        ...weights,
        weights: preset.weights,
      });
      setSelectedPreset(presetKey);
    }
  };

  // Save weights
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(weights);
      setHasChanges(false);
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to defaults
  const handleReset = () => {
    setWeights(DEFAULT_WEIGHTS);
    setSelectedPreset(null);
    onReset?.();
  };

  // Calculate total weight (should always be ~1)
  const totalWeight = Object.values(weights.weights).reduce((a, b) => a + b, 0);

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle>Connection Detection Preferences</CardTitle>
        <CardDescription>
          Customize how different types of connections are weighted in your search results
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <Tabs defaultValue="custom" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="custom">Custom Weights</TabsTrigger>
            <TabsTrigger value="presets">Presets</TabsTrigger>
          </TabsList>
          
          <TabsContent value="custom" className="space-y-6">
            <div className="space-y-4">
              {Object.entries(engineInfo).map(([engineType, info]) => {
                const weight = weights.weights[engineType as EngineType];
                const Icon = info.icon;
                
                return (
                  <div key={engineType} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded ${info.bgColor}`}>
                          <Icon className={`w-4 h-4 ${info.color}`} />
                        </div>
                        <div>
                          <Label htmlFor={engineType} className="text-sm font-medium">
                            {info.name}
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            {info.description}
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary" className="min-w-[60px] text-center">
                        {(weight * 100).toFixed(0)}%
                      </Badge>
                    </div>
                    
                    <Slider
                      id={engineType}
                      min={0}
                      max={100}
                      step={1}
                      value={[weight * 100]}
                      onValueChange={(value) => handleWeightChange(engineType as EngineType, value.map(v => v / 100))}
                      className="w-full"
                    />
                  </div>
                );
              })}
            </div>
            
            <Separator />
            
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total Weight:</span>
              <Badge variant={Math.abs(totalWeight - 1) < 0.01 ? 'default' : 'destructive'}>
                {(totalWeight * 100).toFixed(0)}%
              </Badge>
            </div>
            
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Normalization:</span>
              <select
                className="text-sm border rounded px-2 py-1"
                value={weights.normalizationMethod}
                onChange={(e) => setWeights({ ...weights, normalizationMethod: e.target.value as any })}
              >
                <option value="linear">Linear</option>
                <option value="sigmoid">Sigmoid</option>
                <option value="softmax">Softmax</option>
              </select>
            </div>
          </TabsContent>
          
          <TabsContent value="presets" className="space-y-4">
            {Object.entries(presets).map(([key, preset]) => (
              <Card
                key={key}
                className={`cursor-pointer transition-colors ${
                  selectedPreset === key ? 'ring-2 ring-primary' : 'hover:bg-secondary/50'
                }`}
                onClick={() => applyPreset(key)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{preset.name}</CardTitle>
                    {selectedPreset === key && (
                      <Badge variant="default">Selected</Badge>
                    )}
                  </div>
                  <CardDescription className="text-sm">
                    {preset.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {Object.entries(preset.weights)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 4)
                      .map(([engine, weight]) => {
                        const info = engineInfo[engine as EngineType];
                        const Icon = info.icon;
                        return (
                          <div key={engine} className="flex items-center gap-1">
                            <Icon className={`w-3 h-3 ${info.color}`} />
                            <span className="truncate">{info.name}:</span>
                            <span className="font-medium">{(weight * 100).toFixed(0)}%</span>
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
        
        <Separator className="my-6" />
        
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={!hasChanges}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset to Defaults
          </Button>
          
          <Button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save Preferences'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}