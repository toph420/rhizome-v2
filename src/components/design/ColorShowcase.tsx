/**
 * Color Showcase - Forces Tailwind to generate all pastel color utilities
 * This component ensures all bg-*, text-*, border-* classes are available
 */

export function ColorShowcase() {
  const pastelColors = [
    'mint', 'sage', 'cream', 'peach', 'lavender', 'periwinkle',
    'seafoam', 'lime', 'mustard', 'coral', 'pink', 'lilac',
    'sky', 'mint-green', 'gold', 'salmon', 'rose', 'purple',
    'cyan', 'forest', 'amber', 'red', 'hot-pink', 'violet'
  ];

  const vibrantColors = [
    'vibrant-pink', 'vibrant-yellow', 'vibrant-orange',
    'vibrant-purple', 'vibrant-teal', 'vibrant-cyan'
  ];

  return (
    <div className="p-8 space-y-8">
      {/* Pastel Colors */}
      <div>
        <h2 className="text-2xl font-heading mb-4">Pastel Color Palette</h2>
        <div className="grid grid-cols-6 gap-2">
          {pastelColors.map(color => (
            <div key={color} className="text-center">
              <div className={`h-20 border-2 border-black bg-${color}`} />
              <p className="text-xs mt-1">{color}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Vibrant Colors */}
      <div>
        <h2 className="text-2xl font-heading mb-4">Vibrant Color Palette</h2>
        <div className="grid grid-cols-6 gap-2">
          {vibrantColors.map(color => (
            <div key={color} className="text-center">
              <div className={`h-20 border-2 border-black bg-${color}`} />
              <p className="text-xs mt-1">{color.replace('vibrant-', '')}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Hidden div that forces all utilities to be generated */}
      <div className="hidden">
        {/* Pastel background colors */}
        <div className="bg-mint bg-sage bg-cream bg-peach bg-lavender bg-periwinkle bg-seafoam bg-lime bg-mustard bg-coral bg-pink bg-lilac bg-sky bg-mint-green bg-gold bg-salmon bg-rose bg-purple bg-cyan bg-forest bg-amber bg-red bg-hot-pink bg-violet" />

        {/* Pastel text colors */}
        <div className="text-mint text-sage text-cream text-peach text-lavender text-periwinkle text-seafoam text-lime text-mustard text-coral text-pink text-lilac text-sky text-mint-green text-gold text-salmon text-rose text-purple text-cyan text-forest text-amber text-red text-hot-pink text-violet" />

        {/* Pastel border colors */}
        <div className="border-mint border-sage border-cream border-peach border-lavender border-periwinkle border-seafoam border-lime border-mustard border-coral border-pink border-lilac border-sky border-mint-green border-gold border-salmon border-rose border-purple border-cyan border-forest border-amber border-red border-hot-pink border-violet" />

        {/* Vibrant background colors */}
        <div className="bg-vibrant-pink bg-vibrant-yellow bg-vibrant-orange bg-vibrant-purple bg-vibrant-teal bg-vibrant-cyan" />

        {/* Vibrant text colors */}
        <div className="text-vibrant-pink text-vibrant-yellow text-vibrant-orange text-vibrant-purple text-vibrant-teal text-vibrant-cyan" />

        {/* Vibrant border colors */}
        <div className="border-vibrant-pink border-vibrant-yellow border-vibrant-orange border-vibrant-purple border-vibrant-teal border-vibrant-cyan" />
      </div>
    </div>
  );
}
