export function applyGroundingVisualSink(
    sprite: Phaser.Physics.Arcade.Sprite,
    sinkPx: number,
): void {
    if (!sinkPx) return;

    const body = sprite.body as Phaser.Physics.Arcade.Body | undefined;
    if (!body) return;

    // Keep the physics body on the same collision plane while letting the art
    // overlap the grass lip slightly so grounded actors read as planted.
    sprite.y += sinkPx;
    body.setOffset(body.offset.x, body.offset.y - sinkPx);
}
