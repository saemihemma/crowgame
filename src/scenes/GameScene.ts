import Phaser from 'phaser';
import { SCENES, GAME_WIDTH, GAME_HEIGHT, TILE_SIZE } from '../utils/Constants';
import { Player } from '../entities/Player';
import { InputManager } from '../systems/InputManager';
import { LevelManager } from '../systems/LevelManager';
import { NPCFactory } from '../systems/NPCFactory';
import { SaveManager } from '../systems/SaveManager';
import { AudioManager } from '../systems/AudioManager';
import { BaseNPC } from '../entities/npc/BaseNPC';
import { DialogComponent } from '../entities/npc/components/DialogComponent';
import type { PlayerTuningData } from '../utils/Types';
import { EventBus, GameEvents } from '../utils/EventBus';
import { DopamineFX } from '../ui/fx/DopamineFX';
import { Enemy, type EnemyRegistry } from '../entities/enemies/Enemy';
import { Cockroach } from '../entities/enemies/Cockroach';
import { Projectile } from '../entities/Projectile';
import { TextManager } from '../systems/TextManager';
import { ThemeManager } from '../ui/theme/ThemeManager';

export class GameScene extends Phaser.Scene {
    private player!: Player;
    private inputManager!: InputManager;
    private groundLayer: Phaser.Tilemaps.TilemapLayer | null = null;
    private coins: Phaser.Physics.Arcade.Group | null = null;
    private coinCount = 0;
    private coinsAtLevelStart = 0;
    private lives = 3;
    private maxLives = 3;
    private transitioning = false;
    private respawning = false;
    private activeNPCs: BaseNPC[] = [];
    private currentLevelKey = '';
    private nearbyNPC: BaseNPC | null = null;
    private spawnPoint = { x: 128, y: 400 };
    private hazards: Phaser.Physics.Arcade.StaticGroup | null = null;
    private activeEnemies: Enemy[] = [];
    private projectiles: Projectile[] = [];
    private shootCooldown = 0;
    private shootCooldownMs = 1000;
    private laserSpeed = 300;
    private doors: Array<{
        img: Phaser.GameObjects.Sprite;
        zone: Phaser.GameObjects.Zone;
        targetLevel: string;
        inProximity: boolean;
    }> = [];

    constructor() {
        super({ key: SCENES.GAME });
    }

    create(data: { levelKey?: string }): void {
        // Reset state for scene re-entry
        this.groundLayer = null;
        this.coins = null;
        this.transitioning = false;
        this.respawning = false;
        this.activeNPCs = [];
        this.nearbyNPC = null;
        this.hazards = null;
        this.activeEnemies = [];
        this.projectiles = [];
        this.shootCooldown = 0;
        this.doors = [];

        // Load persisted coin count from SaveManager
        const save = SaveManager.getInstance().getData();
        this.coinCount = save.coins;
        this.coinsAtLevelStart = this.coinCount;
        this.lives = this.maxLives; // Full lives each level

        const levelKey = data.levelKey || 'level_01';
        this.currentLevelKey = levelKey;

        // Track current level in LevelManager & SaveManager
        LevelManager.getInstance().setCurrentLevel(levelKey);
        SaveManager.getInstance().setCurrentLevel(levelKey);

        // Setup input
        this.inputManager = new InputManager(this);
        this.inputManager.setup();

        // Load tuning data
        const tuningData = this.cache.json.get('player_tuning') as PlayerTuningData;

        // Load combat tuning
        const combatTuning = this.cache.json.get('combat_tuning') as { laser_speed?: number; laser_cooldown_ms?: number } | undefined;
        if (combatTuning) {
            this.laserSpeed = combatTuning.laser_speed ?? 300;
            this.shootCooldownMs = combatTuning.laser_cooldown_ms ?? 1000;
        }

        // Try to load compiled tilemap level
        let playerX = 128;
        let playerY = 400;
        let groundLayer: Phaser.Tilemaps.TilemapLayer | null = null;

        if (this.cache.tilemap.has(levelKey)) {
            const result = this.loadTiledLevel(levelKey);
            if (result) {
                playerX = result.spawnX;
                playerY = result.spawnY;
                groundLayer = result.groundLayer;
            }
        } else {
            // Fallback: create a simple test level with graphics
            this.createTestLevel();
        }

        this.groundLayer = groundLayer;
        this.spawnPoint = { x: playerX, y: playerY };

        // Store groundLayer on scene data so enemies can use it for edge detection
        this.data.set('groundLayer', groundLayer);

        // Create player
        this.player = new Player(this, playerX, playerY, tuningData);

        // Collisions
        if (groundLayer) {
            this.physics.add.collider(this.player.sprite, groundLayer);
        }

        // Coin collection (this.coins is set by spawnCoin inside loadTiledLevel)
        const coins = this.coins;
        if (coins) {
            this.physics.add.overlap(this.player.sprite, coins, this.collectCoin, undefined, this);
        }

        // Setup NPC collision + auto-trigger interaction
        for (const npc of this.activeNPCs) {
            // Solid collision so the player bumps into the NPC
            this.physics.add.collider(this.player.sprite, npc.sprite);

            // Interaction zone overlap — auto-triggers dialog on contact
            this.physics.add.overlap(
                this.player.sprite,
                npc.getInteractZone(),
                () => {
                    this.nearbyNPC = npc;
                    npc.setPlayerInRange(true);
                    // Auto-trigger interaction if not already interacting
                    if (!npc.isInteracting() && !this.transitioning && !this.respawning) {
                        npc.interact();
                    }
                },
                undefined,
                this,
            );
        }

        // Hazard overlap (spikes etc.)
        if (this.hazards) {
            this.physics.add.overlap(
                this.player.sprite,
                this.hazards,
                this.onHitHazard,
                undefined,
                this,
            );
        }

        // Enemy collisions
        for (const enemy of this.activeEnemies) {
            if (groundLayer) {
                this.physics.add.collider(enemy.sprite, groundLayer);
            }
            for (const npc of this.activeNPCs) {
                this.physics.add.collider(enemy.sprite, npc.sprite);
            }
            this.physics.add.overlap(
                this.player.sprite,
                enemy.sprite,
                () => this.onHitEnemy(enemy),
                undefined,
                this,
            );
        }

        // Camera - use tuning from camera_tuning.json
        const camTuning = this.cache.json.get('camera_tuning') as {
            followLerp?: number; deadzone?: { width: number; height: number }; zoomLevel?: number;
        } | undefined;
        const lerp = camTuning?.followLerp ?? 1;
        this.cameras.main.startFollow(this.player.sprite, true, lerp, lerp);
        if (camTuning?.deadzone) {
            this.cameras.main.setDeadzone(camTuning.deadzone.width, camTuning.deadzone.height);
        }
        if (camTuning?.zoomLevel && camTuning.zoomLevel !== 1) {
            this.cameras.main.setZoom(camTuning.zoomLevel);
        }
        this.cameras.main.setBackgroundColor('#87CEEB'); // Sky blue

        // Set camera bounds to world/map size
        if (groundLayer) {
            const map = groundLayer.tilemap;
            this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
            this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
        }

        // Fade in from black on level enter
        this.cameras.main.fadeIn(300, 0, 0, 0);

        // Launch HUD scene alongside this scene (passes inputManager for touch controls)
        if (!this.scene.isActive(SCENES.HUD)) {
            this.scene.launch(SCENES.HUD, { inputManager: this.inputManager });
        }

        // Start level music based on registry (music field is the manifest key directly)
        const levelEntry = LevelManager.getInstance().getLevel(this.currentLevelKey);
        if (levelEntry?.music) {
            AudioManager.getInstance().playMusic(levelEntry.music, 800);
        }

        // Sync HUD with persisted coin count
        if (this.coinCount > 0) {
            // Delay slightly so HUD has time to initialize
            this.time.delayedCall(50, () => {
                EventBus.emit(GameEvents.COINS_CHANGED, this.coinCount);
            });
        }

        // ESC key toggles pause
        this.input.keyboard?.on('keydown-ESC', () => {
            if (!this.transitioning && !this.scene.isActive(SCENES.PAUSE)) {
                this.scene.launch(SCENES.PAUSE);
            }
        });
    }

    private loadTiledLevel(levelKey: string): { spawnX: number; spawnY: number; groundLayer: Phaser.Tilemaps.TilemapLayer } | null {
        const map = this.make.tilemap({ key: levelKey });

        // Add tileset — dynamically find the tileset name from the map data
        const tilesetData = map.tilesets[0];
        const tilesetName = tilesetData?.name || 'forest_tiles';
        const tileset = map.addTilesetImage(tilesetName, tilesetName, TILE_SIZE, TILE_SIZE);
        if (!tileset) {
            console.warn(`Failed to add tileset "${tilesetName}" for level "${levelKey}"`);
            this.createTestLevel();
            return null;
        }

        // Create layers
        map.createLayer('background', tileset, 0, 0);
        const groundLayer = map.createLayer('ground', tileset, 0, 0);
        map.createLayer('decoration', tileset, 0, 0);

        if (!groundLayer) {
            console.warn('Failed to create ground layer');
            this.createTestLevel();
            return null;
        }

        // Randomize tile variants for visual variety and set collision
        this.randomizeGroundTiles(groundLayer);

        // Parse object layer
        let spawnX = 64;
        let spawnY = 200;

        const objectLayer = map.getObjectLayer('objects');
        if (objectLayer) {
            for (const obj of objectLayer.objects) {
                switch (obj.type) {
                    case 'player_spawn':
                        spawnX = obj.x!;
                        spawnY = obj.y! - TILE_SIZE; // Adjust for sprite height
                        break;
                    case 'collectible':
                        this.spawnCoin(obj.x!, obj.y!);
                        break;
                    case 'npc': {
                        const npcId = this.getObjectProperty(obj, 'npc_id') as string;
                        if (npcId) {
                            this.spawnNPC(obj.x!, obj.y!, npcId);
                        }
                        break;
                    }
                    case 'door': {
                        const targetLevel = this.getObjectProperty(obj, 'target_level') as string;
                        this.createDoor(obj.x!, obj.y!, targetLevel);
                        break;
                    }
                    case 'hazard': {
                        this.spawnHazard(obj.x!, obj.y!, obj.width || TILE_SIZE, obj.height || TILE_SIZE);
                        break;
                    }
                    case 'enemy': {
                        const enemyId = this.getObjectProperty(obj, 'enemy_id') as string;
                        if (enemyId) {
                            this.spawnEnemy(obj.x!, obj.y!, enemyId);
                        }
                        break;
                    }
                }
            }
        }

        return { spawnX, spawnY, groundLayer };
    }

    /**
     * Setup ground tiles for collision (simple 2-tile system)
     */
    private randomizeGroundTiles(groundLayer: Phaser.Tilemaps.TilemapLayer): void {
        // Simple 2-tile system: tile 1 (top3 grass) and tile 2 (bottom2 dirt)
        // No randomization needed - tiles already set correctly in level JSON
        // ALSO include tile 3 (platform) for floating platform collision
        const TILE_IDS = [1, 2, 3];

        // Set collision on all tiles
        groundLayer.setCollision(TILE_IDS);

        console.log(`[GameScene] Using 2-tile system (level1_tiles.png): tiles ${TILE_IDS}`);
    }

    private createTestLevel(): void {
        // Simple rectangle platforms as fallback
        const graphics = this.add.graphics();

        // Ground
        graphics.fillStyle(0x4a7c59);
        graphics.fillRect(0, GAME_HEIGHT - 64, GAME_WIDTH * 3, 64);

        // Create static physics body for ground
        const ground = this.physics.add.staticBody(0, GAME_HEIGHT - 64, GAME_WIDTH * 3, 64);

        // Platform
        graphics.fillStyle(0x888899);
        graphics.fillRect(400, GAME_HEIGHT - 160, 192, 32);
        const platform = this.physics.add.staticBody(400, GAME_HEIGHT - 160, 192, 32);

        // Another platform
        graphics.fillStyle(0x888899);
        graphics.fillRect(700, GAME_HEIGHT - 256, 192, 32);
        const platform2 = this.physics.add.staticBody(700, GAME_HEIGHT - 256, 192, 32);

        // For the test level, add direct colliders after player is created
        this.events.once('postupdate', () => {
            if (this.player?.sprite) {
                this.physics.add.collider(this.player.sprite, ground as unknown as Phaser.Physics.Arcade.StaticBody);
                this.physics.add.collider(this.player.sprite, platform as unknown as Phaser.Physics.Arcade.StaticBody);
                this.physics.add.collider(this.player.sprite, platform2 as unknown as Phaser.Physics.Arcade.StaticBody);
            }
        });

        this.physics.world.setBounds(0, 0, GAME_WIDTH * 3, GAME_HEIGHT);
        this.cameras.main.setBounds(0, 0, GAME_WIDTH * 3, GAME_HEIGHT);
    }

    private spawnCoin(x: number, y: number): void {
        if (!this.coins) {
            this.coins = this.physics.add.group({
                allowGravity: false,
                immovable: true,
            });
        }
        const coin = this.coins.create(x, y, 'coin', 0) as Phaser.Physics.Arcade.Sprite;
        const body = coin.body as Phaser.Physics.Arcade.Body;
        body.setSize(20, 20);
        body.setOffset(6, 6);
        coin.anims.play('coin_spin');
    }

    private collectCoin(
        _player: Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
        coin: Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Tilemaps.Tile,
    ): void {
        // Don't collect coins during level transition
        if (this.transitioning) return;

        const coinSprite = coin as Phaser.Physics.Arcade.Sprite;
        const cx = coinSprite.x;
        const cy = coinSprite.y;

        coinSprite.destroy();
        this.coinCount++;

        // Dopamine FX: coin burst particles at collection point
        DopamineFX.coinBurst(this, cx, cy);

        // Play coin collect sound
        AudioManager.getInstance().playSFX('coin_collect');

        // Notify HUD via EventBus (CoinCounter listens to this)
        EventBus.emit(GameEvents.COINS_CHANGED, this.coinCount);
    }

    /** Spawn an NPC from the NPC registry via NPCFactory */
    private spawnNPC(x: number, y: number, npcId: string): void {
        const factory = NPCFactory.getInstance();
        const npc = factory.create(this, x, y, npcId);
        if (npc) {
            this.activeNPCs.push(npc);
        }
    }

    private createDoor(x: number, y: number, targetLevel: string): void {
        // Use a gameplay-sized 36-frame door animation sprite.
        let doorImg: Phaser.GameObjects.Sprite;
        if (this.textures.exists('door')) {
            doorImg = this.add.sprite(x + 16, y, 'door', 0);
            doorImg.setOrigin(0.5, 1);
            doorImg.play('door_idle');
        } else {
            // Fallback rectangle
            const rect = this.add.rectangle(x + 16, y, 32, 96, 0x8B4513);
            rect.setOrigin(0.5, 1);
            doorImg = rect as unknown as Phaser.GameObjects.Sprite;
        }

        // Pulsing glow to show it's a portal
        this.tweens.add({
            targets: doorImg,
            alpha: { from: 0.8, to: 1 },
            duration: 800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        // Trigger zone — fires automatically when the player walks into it
        const zone = this.add.zone(x + 16, y - 32, 56, 80);
        this.physics.add.existing(zone, true);

        // Store door for proximity tracking
        const doorData = {
            img: doorImg,
            zone,
            targetLevel,
            inProximity: false,
        };
        this.doors.push(doorData);

        // Defer overlap setup until player exists (doors are created during loadTiledLevel before player)
        this.events.once('postupdate', () => {
            if (this.player?.sprite) {
                this.physics.add.overlap(this.player.sprite, zone, () => {
                    if (this.transitioning) return;
                    // Trigger immediately on contact — no button press needed
                    this.transitionToLevel(targetLevel, doorImg);
                });
            }
        });
    }

    /** Perform a level transition with FX */
    private transitionToLevel(targetLevel: string, door: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle): void {
        this.transitioning = true;

        // Freeze the player immediately so they don't drift
        (this.player.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
        this.player.sprite.body!.enable = false;

        // Door unlock glow
        DopamineFX.doorUnlock(this, door);

        // Level complete flourish
        DopamineFX.levelComplete(this, () => {
            // Use LevelManager to emit events (even for __complete__)
            LevelManager.getInstance().transitionTo(targetLevel);

            // Fade out music alongside camera
            AudioManager.getInstance().stopMusic(400);

            if (targetLevel === '__complete__') {
                // All levels done — show celebration screen
                this.cameras.main.fadeOut(400, 0, 0, 0);
                this.cameras.main.once('camerafadeoutcomplete', () => {
                    this.scene.stop(SCENES.HUD);
                    this.showCompletionScreen();
                });
                return;
            }

            // Fade out camera
            this.cameras.main.fadeOut(400, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                // Stop HUD so it can be relaunched fresh
                this.scene.stop(SCENES.HUD);
                // Restart with new level
                this.scene.restart({ levelKey: targetLevel });
            });
        });
    }

    // ─── Completion Screen ──────────────────────────

    /** Full-screen celebration when all levels are completed */
    private showCompletionScreen(): void {
        const tt = TextManager.getInstance();
        const tm = ThemeManager.getInstance();
        const cx = GAME_WIDTH / 2;

        // Clear the game world
        this.children.removeAll(true);
        this.physics.world.shutdown();

        // Background
        this.cameras.main.fadeIn(400, 0, 0, 0);
        const bg = this.add.graphics();
        bg.fillGradientStyle(
            tm.getColorNum('primary'), tm.getColorNum('primary'),
            tm.getColorNum('secondary'), tm.getColorNum('secondary'),
            0.9, 0.9, 0.7, 0.7,
        );
        bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

        // Big celebration bursts
        this.time.delayedCall(300, () => {
            DopamineFX.celebrationBurst(this, cx - 150, GAME_HEIGHT / 3);
            DopamineFX.celebrationBurst(this, cx + 150, GAME_HEIGHT / 3);
        });
        this.time.delayedCall(600, () => {
            DopamineFX.celebrationBurst(this, cx, GAME_HEIGHT / 4);
        });

        // Title
        const title = this.add.text(cx, 120, tt.t('game.congratulations_title'), {
            fontSize: '56px',
            fontFamily: 'monospace',
            color: tm.getColor('accent'),
            stroke: '#000000',
            strokeThickness: 8,
            align: 'center',
        }).setOrigin(0.5, 0.5).setScale(0);
        DopamineFX.elasticEntrance(this, title, 500, 200);

        // Body text
        const body = this.add.text(cx, 260, tt.t('game.congratulations_body'), {
            fontSize: '22px',
            fontFamily: 'monospace',
            color: tm.getColor('textColor'),
            stroke: '#000000',
            strokeThickness: 3,
            align: 'center',
            wordWrap: { width: GAME_WIDTH - 120 },
        }).setOrigin(0.5, 0.5).setScale(0);
        DopamineFX.elasticEntrance(this, body, 400, 500);

        // "Play Again" button
        this.createCompletionButton(cx, 390, tt.t('game.play_again'), tm.getColorNum('accent'), 700, () => {
            this.cameras.main.fadeOut(300, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.scene.restart({ levelKey: 'level_01' });
            });
        });

        // "Back to Menu" button
        this.createCompletionButton(cx, 460, tt.t('game.back_to_menu'), tm.getColorNum('secondary'), 900, () => {
            this.cameras.main.fadeOut(300, 0, 0, 0);
            this.cameras.main.once('camerafadeoutcomplete', () => {
                this.scene.start(SCENES.MAIN_MENU);
            });
        });
    }

    private createCompletionButton(x: number, y: number, label: string, color: number, delay: number, onClick: () => void): void {
        const w = 320;
        const h = 56;

        const bg = this.add.graphics();
        bg.fillStyle(color, 1);
        bg.fillRoundedRect(x - w / 2, y - h / 2, w, h, 14);
        bg.lineStyle(4, 0xffffff, 0.35);
        bg.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 14);

        const text = this.add.text(x, y, label, {
            fontSize: '26px',
            fontFamily: 'monospace',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 4,
            align: 'center',
        }).setOrigin(0.5, 0.5).setScale(0);

        const zone = this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true });
        zone.on('pointerover', () => text.setScale(1.08));
        zone.on('pointerout', () => text.setScale(1));
        zone.on('pointerdown', onClick);

        DopamineFX.elasticEntrance(this, text, 400, delay);
    }

    // ─── Laser ──────────────────────────────────────

    private shootLaser(): void {
        this.shootCooldown = this.shootCooldownMs;

        const direction = this.player.sprite.flipX ? -1 : 1;
        // Position at eye/beak - crow is 64px tall, eye is ~48px up from bottom
        // Crow is 64px wide centered, beak/eye is ~20px from center
        const offsetX = direction * 20;
        const x = this.player.sprite.x + offsetX;
        const y = this.player.sprite.y - 40; // Eye level (crow is 64px tall, eye ~3/4 up)

        const projectile = new Projectile(this, x, y, direction, this.laserSpeed);
        this.projectiles.push(projectile);

        // Play shoot sound
        AudioManager.getInstance().playSFX('player_shoot');

        // Set up overlap with each enemy
        for (const enemy of this.activeEnemies) {
            if (enemy.isDead()) continue;
            this.physics.add.overlap(projectile.sprite, enemy.sprite, () => {
                if (!enemy.isDead() && projectile.sprite.active) {
                    this.killEnemy(enemy);
                    projectile.destroy();
                    this.projectiles = this.projectiles.filter(p => p !== projectile);
                }
            });
        }

        // Small recoil flash
        DopamineFX.screenFlash(this, 0xffaa00, 50);
    }

    // ─── Hazards & Death ──────────────────────────────────────

    /**
     * Spawn a spike hazard at the given position
     */
    private spawnHazard(x: number, y: number, w: number, h: number): void {
        if (!this.hazards) {
            this.hazards = this.physics.add.staticGroup();
        }

        // Render pixel art spikes if texture exists
        if (this.textures.exists('spike_hazards')) {
            this.renderPixelArtSpikes(x, y, w, h);
        }
        // NO FALLBACK - if asset missing, just skip visual rendering

        // Create invisible physics collision zone
        const zone = this.hazards.create(x + w / 2, y + h / 2, undefined, undefined, false) as Phaser.Physics.Arcade.Sprite;
        zone.setVisible(false);
        zone.body!.setSize(w, h);
        zone.refreshBody();
    }

    /**
     * Render pixel art spikes using spike_hazards spritesheet
     */
    private renderPixelArtSpikes(x: number, y: number, w: number, h: number): void {
        // Select appropriate spike frame based on width
        let frameKey = 'spike_1_32';
        if (w <= 32) frameKey = 'spike_1_32';
        else if (w <= 64) frameKey = 'spike_1_64';
        else if (w <= 96) frameKey = 'spike_1_96';
        else frameKey = 'spike_1_128';

        // Position spike at bottom of hazard zone, preserving native 32px height
        const spikeImg = this.add.image(x + w / 2, y + h, 'spike_hazards', frameKey);
        spikeImg.setOrigin(0.5, 1.0);
        spikeImg.setDepth(5);
    }



    private spawnEnemy(x: number, y: number, enemyId: string): void {
        const registry = this.cache.json.get('enemy_registry') as EnemyRegistry | undefined;
        if (!registry) return;
        const def = registry.enemies.find(e => e.id === enemyId);
        if (!def) {
            console.warn(`Unknown enemy ID: ${enemyId}`);
            return;
        }
        const enemy = new Cockroach(this, x, y, def);
        this.activeEnemies.push(enemy);
    }

    private onHitEnemy(enemy: Enemy): void {
        if (this.respawning || this.transitioning || enemy.isDead()) return;
        this.hurtPlayer();
    }

    killEnemy(enemy: Enemy): void {
        if (enemy.isDead()) return;
        enemy.kill();

        const ex = enemy.sprite.x;
        const ey = enemy.sprite.y;

        // Enemy death animation
        DopamineFX.enemyDeath(this, ex, ey);

        // Play enemy death sound
        AudioManager.getInstance().playSFX('enemy_death');

        // Award coins with visual feedback
        this.coinCount += enemy.definition.coinReward;
        DopamineFX.numberFlyUp(this, ex, ey - 20, `+${enemy.definition.coinReward}`, '#ffd700');
        EventBus.emit(GameEvents.COINS_CHANGED, this.coinCount);

        // Fade out and destroy
        this.tweens.add({
            targets: enemy.sprite,
            alpha: 0,
            scaleX: 0.5,
            scaleY: 0.5,
            duration: 200,
            onComplete: () => enemy.destroy(),
        });
    }

    private onHitHazard = (): void => {
        if (this.respawning || this.transitioning) return;
        this.hurtPlayer();
    };

    private hurtPlayer(): void {
        if (this.respawning) return;
        this.lives--;

        // Screen shake + flash
        this.cameras.main.shake(150, 0.005);
        DopamineFX.screenFlash(this, 0xff0000, 200);

        // Emit event so HealthBar animates
        EventBus.emit('player-hurt');

        if (this.lives <= 0) {
            this.playerDie();
        } else {
            this.respawnPlayer();
        }
    }

    private playerDie(): void {
        this.respawning = true;
        this.player.sprite.body!.enable = false;
        (this.player.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);

        // Brief freeze before death sequence
        this.time.delayedCall(200, () => {
            this.player.sprite.setVisible(false);

            // "Oops!" text
            const cx = this.cameras.main.width / 2;
            const cy = this.cameras.main.height / 2;
            const deathText = this.add.text(cx, cy, 'Oops!', {
                fontSize: '48px',
                fontFamily: 'monospace',
                color: '#ff4444',
                stroke: '#000000',
                strokeThickness: 6,
            }).setOrigin(0.5).setScrollFactor(0).setDepth(500);

            // Float up, then fade to black and restart level
            this.tweens.add({
                targets: deathText,
                y: cy - 40,
                duration: 600,
                ease: 'Power2',
                onComplete: () => {
                    this.cameras.main.fadeOut(400, 0, 0, 0);
                    this.cameras.main.once('camerafadeoutcomplete', () => {
                        deathText.destroy();

                        // Reset coins collected this level
                        this.coinCount = this.coinsAtLevelStart;
                        EventBus.emit(GameEvents.COINS_CHANGED, this.coinCount);

                        // Restart level with full lives
                        this.scene.stop(SCENES.HUD);
                        this.scene.restart({ levelKey: this.currentLevelKey });
                    });
                },
            });
        });

        EventBus.emit(GameEvents.PLAYER_DIED);
    }

    private respawnPlayer(): void {
        this.respawning = true;
        this.player.sprite.body!.enable = false;

        // Brief invulnerability flash
        this.player.sprite.setPosition(this.spawnPoint.x, this.spawnPoint.y);
        this.player.sprite.setVisible(true);
        (this.player.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);

        // Blink effect for invulnerability
        let blinks = 0;
        const blinkTimer = this.time.addEvent({
            delay: 100,
            repeat: 9,
            callback: () => {
                blinks++;
                this.player.sprite.setAlpha(blinks % 2 === 0 ? 1 : 0.3);
            },
        });

        this.time.delayedCall(1000, () => {
            blinkTimer.destroy();
            this.player.sprite.setAlpha(1);
            this.player.sprite.body!.enable = true;
            this.respawning = false;
        });
    }

    /** Check if player fell into a pit (below the map) */
    private checkPitDeath(): void {
        if (this.respawning || this.transitioning) return;

        const mapHeight = this.groundLayer
            ? this.groundLayer.tilemap.heightInPixels
            : GAME_HEIGHT;

        if (this.player.sprite.y > mapHeight + 64) {
            this.hurtPlayer();
        }
    }

    private getObjectProperty(obj: Phaser.Types.Tilemaps.TiledObject, name: string): unknown {
        if (!obj.properties) return undefined;
        for (const prop of obj.properties as Array<{ name: string; value: unknown }>) {
            if (prop.name === name) return prop.value;
        }
        return undefined;
    }

    update(_time: number, delta: number): void {
        if (!this.player || this.transitioning) return;

        // Check for pit death even during respawn
        this.checkPitDeath();

        if (this.respawning) return;

        const input = this.inputManager.getInput();
        this.player.update(input, delta);

        // Update NPCs
        for (const npc of this.activeNPCs) {
            npc.update(delta);
        }

        // Update enemies
        for (const enemy of this.activeEnemies) {
            enemy.update(delta);
        }

        // Update projectiles
        this.projectiles = this.projectiles.filter(p => p.update(delta));

        // Check door proximity and switch sprites
        for (const door of this.doors) {
            const playerX = this.player.sprite.x;
            const playerY = this.player.sprite.y;
            const doorX = door.zone.x;
            const doorY = door.zone.y;
            const distance = Phaser.Math.Distance.Between(playerX, playerY, doorX, doorY);
            const proximityThreshold = 100; // pixels

            const wasInProximity = door.inProximity;
            door.inProximity = distance < proximityThreshold;

            // Play door animation when entering/leaving proximity
            if (door.inProximity !== wasInProximity && this.anims.exists('door_open')) {
                if (door.inProximity) {
                    // Play opening animation when player is near
                    door.img.play('door_open');
                    // TODO: Add sound effect when player enters proximity
                } else {
                    // Return to idle (closed) when player moves away
                    door.img.play('door_idle');
                }
            }
        }

        // Shooting
        this.shootCooldown = Math.max(0, this.shootCooldown - delta);
        if (input.shoot && this.shootCooldown <= 0) {
            this.shootLaser();
        }

        // Check NPC proximity (reset nearby if no overlap this frame)
        // The overlap callback sets nearbyNPC; we clear it each frame
        // and let the overlap re-set it
        const previousNearby = this.nearbyNPC;
        this.nearbyNPC = null;

        // Re-check overlaps (Phaser handles this automatically via overlap callbacks)
        // If no overlap fires this frame, nearbyNPC stays null
        // We defer the "out of range" check to after physics
        this.events.once('postupdate', () => {
            if (previousNearby && !this.nearbyNPC) {
                previousNearby.setPlayerInRange(false);
            }

            // Advance dialog with interact key (E / tap) if already in conversation
            if (this.nearbyNPC && input.interact) {
                const dialogComp = this.nearbyNPC.getComponent<DialogComponent>('dialog');
                if (dialogComp && dialogComp.isDialogVisible()) {
                    dialogComp.advance();
                }
            }
        });
    }

    shutdown(): void {
        // Stop the HUD scene when GameScene shuts down
        this.scene.stop(SCENES.HUD);
        // Clean up NPCs
        for (const npc of this.activeNPCs) {
            npc.destroy();
        }
        this.activeNPCs = [];
        for (const enemy of this.activeEnemies) {
            enemy.destroy();
        }
        this.activeEnemies = [];
    }
}
