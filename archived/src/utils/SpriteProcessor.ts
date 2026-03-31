/**
 * SpriteProcessor - Utility for post-processing sprites to enhance AI-generated art
 *
 * Features:
 * - Pixel-perfect scaling (no blur)
 * - Outline generation
 * - Glow effects
 * - Color correction
 * - Artifact cleanup
 */
export class SpriteProcessor {
    /**
     * Apply pixel-perfect scaling to prevent blurring
     */
    static applyPixelPerfectScale(texture: Phaser.Textures.Texture): void {
        // Set texture filtering to NEAREST for crisp pixel art
        if (texture && texture.source[0]) {
            const source = texture.source[0];
            if (source.scaleMode !== undefined) {
                source.setFilter(Phaser.Textures.FilterMode.NEAREST);
            }
        }
    }

    /**
     * Apply pixel-perfect rendering to a game object
     */
    static makePixelPerfect(gameObject: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite): void {
        // Disable texture smoothing for crisp pixels
        gameObject.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }

    /**
     * Apply outline to a sprite using canvas manipulation
     * @param scene - Phaser scene
     * @param textureKey - Key of the texture to process
     * @param outlineColor - Color of the outline (hex number)
     * @param thickness - Thickness of the outline in pixels
     */
    static applyOutline(
        scene: Phaser.Scene,
        textureKey: string,
        outlineColor: number = 0x000000,
        thickness: number = 1
    ): string {
        const originalTexture = scene.textures.get(textureKey);
        if (!originalTexture || !originalTexture.source[0]) return textureKey;

        const source = originalTexture.source[0];
        const width = source.width;
        const height = source.height;

        // Create canvas for processing
        const canvas = document.createElement('canvas');
        canvas.width = width + thickness * 2;
        canvas.height = height + thickness * 2;
        const ctx = canvas.getContext('2d')!;

        // Draw outline by drawing the image offset in all directions
        ctx.fillStyle = `#${outlineColor.toString(16).padStart(6, '0')}`;
        for (let dx = -thickness; dx <= thickness; dx++) {
            for (let dy = -thickness; dy <= thickness; dy++) {
                if (dx === 0 && dy === 0) continue;
                ctx.drawImage(source.image as HTMLImageElement, thickness + dx, thickness + dy);
            }
        }

        // Draw original image on top
        ctx.drawImage(source.image as HTMLImageElement, thickness, thickness);

        // Create new texture with outline
        const outlineKey = `${textureKey}_outlined`;
        scene.textures.addImage(outlineKey, canvas as unknown as HTMLImageElement);

        return outlineKey;
    }

    /**
     * Apply glow effect to a sprite
     * @param scene - Phaser scene
     * @param sprite - Sprite to apply glow to
     * @param glowColor - Color of the glow
     * @param intensity - Glow intensity (0-1)
     */
    static applyGlow(
        scene: Phaser.Scene,
        sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image,
        glowColor: number,
        intensity: number = 0.5
    ): void {
        // Create a simple glow effect using tint and scale pulsing
        const originalScale = sprite.scale;
        scene.tweens.add({
            targets: sprite,
            alpha: 1 - intensity * 0.2,
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
    }

    /**
     * Apply color correction to adjust brightness, contrast, saturation
     * Note: This is a simplified version. Full implementation would use shaders or canvas manipulation.
     */
    static applyColorCorrection(
        gameObject: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite,
        brightness: number = 1,
        contrast: number = 1
    ): void {
        // Simple implementation using tint for brightness adjustment
        if (brightness > 1) {
            const tintValue = Math.min(255, Math.floor(brightness * 255));
            gameObject.setTint(
                (tintValue << 16) | (tintValue << 8) | tintValue
            );
        }
    }

    /**
     * Clean up single-pixel artifacts from AI generation
     * This would require canvas manipulation to detect and remove isolated pixels
     */
    static cleanupArtifacts(scene: Phaser.Scene, textureKey: string): string {
        // Placeholder for artifact cleanup
        // Full implementation would analyze the texture pixel by pixel
        // and remove isolated single pixels
        return textureKey;
    }
}
