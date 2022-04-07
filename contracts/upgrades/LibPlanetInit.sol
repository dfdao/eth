// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

// Type imports
import {SpaceType, PlanetType, DFPInitPlanetArgs, Planet, PlanetExtendedInfo, PlanetExtendedInfo2, PlanetDefaultStats} from "../DFTypes.sol";

// Library imports
import {LibGameUtils} from "../libraries/LibGameUtils.sol";
import {LibPlanet} from "../libraries/LibPlanet.sol";
import {Verifier} from "../Verifier.sol";

// Storage imports
import {LibStorage, GameStorage, GameConstants, SnarkConstants} from "../libraries/LibStorage.sol";
import {LibArenaStorage, ArenaConstants} from "../upgrades/LibArenaUpgradeStorage.sol";

library LibPlanetInit {
    function gs() internal pure returns (GameStorage storage) {
        return LibStorage.gameStorage();
    }

    function snarkConstants() internal pure returns (SnarkConstants storage sc) {
        return LibStorage.snarkConstants();
    }

    function gameConstants() internal pure returns (GameConstants storage) {
        return LibStorage.gameConstants();
    }

    function arenaConstants() internal pure returns (ArenaConstants storage) {
        return LibArenaStorage.arenaConstants();
    }

    function initializePlanet(
        uint256[2] memory _a,
        uint256[2][2] memory _b,
        uint256[2] memory _c,
        uint256[8] memory _input,
        bool isHomePlanet
    ) public {
        if (!snarkConstants().DISABLE_ZK_CHECKS) {
            require(Verifier.verifyInitProof(_a, _b, _c, _input), "Failed init proof check");
        }

        uint256 _location = _input[0];
        uint256 _perlin = _input[1];

        LibGameUtils.revertIfBadSnarkPerlinFlags(
            [_input[3], _input[4], _input[5], _input[6], _input[7]],
            false
        );

        // Initialize planet information
        initializePlanetWithDefaults(_location, _perlin, isHomePlanet);
    }

    function initializePlanetWithDefaults(
        uint256 _location,
        uint256 _perlin,
        bool _isHomePlanet
    ) public {
        require(LibGameUtils._locationIdValid(_location), "Not a valid planet location");

        DFPInitPlanetArgs memory initArgs = LibPlanet.getDefaultInitPlanetArgs(
            _location,
            _perlin,
            _isHomePlanet
        );

        _initializePlanet(initArgs);
        gs().planetIds.push(_location);
        gs().initializedPlanetCountByLevel[initArgs.level] += 1;
    }

    function _initializePlanet(DFPInitPlanetArgs memory args) public {
        Planet storage _planet = gs().planets[args.location];
        PlanetExtendedInfo storage _planetExtendedInfo = gs().planetsExtendedInfo[args.location];
        PlanetExtendedInfo2 storage _planetExtendedInfo2 = gs().planetsExtendedInfo2[args.location];
        // can't initialize a planet twice
        require(!_planetExtendedInfo.isInitialized, "Planet is already initialized");

        // planet initialize should set the planet to default state, including having the owner be adress 0x0
        // then it's the responsibility for the mechanics to set the owner to the player

        Planet memory defaultPlanet = _defaultPlanet(
            args.location,
            args.level,
            args.planetType,
            args.spaceType,
            args.TIME_FACTOR_HUNDREDTHS
        );
        _planet.owner = defaultPlanet.owner;
        _planet.isHomePlanet = defaultPlanet.isHomePlanet;
        _planet.range = defaultPlanet.range;
        _planet.speed = defaultPlanet.speed;
        _planet.defense = defaultPlanet.defense;
        _planet.population = defaultPlanet.population;
        _planet.populationCap = defaultPlanet.populationCap;
        _planet.populationGrowth = defaultPlanet.populationGrowth;
        _planet.silverCap = defaultPlanet.silverCap;
        _planet.silverGrowth = defaultPlanet.silverGrowth;
        _planet.silver = defaultPlanet.silver;
        _planet.planetLevel = defaultPlanet.planetLevel;
        _planet.planetType = defaultPlanet.planetType;

        _planetExtendedInfo.isInitialized = true;
        _planetExtendedInfo.perlin = args.perlin;
        _planetExtendedInfo.spaceType = args.spaceType;
        _planetExtendedInfo.createdAt = block.timestamp;
        _planetExtendedInfo.lastUpdated = block.timestamp;
        _planetExtendedInfo.upgradeState0 = 0;
        _planetExtendedInfo.upgradeState1 = 0;
        _planetExtendedInfo.upgradeState2 = 0;

        _planetExtendedInfo2.isInitialized = true;
        _planetExtendedInfo2.pausers = 0;

        if (args.isHomePlanet) {
            _planet.isHomePlanet = true;
            _planet.owner = msg.sender;
            _planet.population = _planet.populationCap / 3;

            // _planet.population = _planet.populationCap / 3;
        } else {
            _planetExtendedInfo.spaceJunk = LibGameUtils.getPlanetDefaultSpaceJunk(_planet);

            if (LibGameUtils.isHalfSpaceJunk(args.location)) {
                _planetExtendedInfo.spaceJunk /= 2;
            }
        }
    }

    function _defaultPlanet(
        uint256 location,
        uint256 level,
        PlanetType planetType,
        SpaceType spaceType,
        uint256 TIME_FACTOR_HUNDREDTHS
    ) public view returns (Planet memory _planet) {
        PlanetDefaultStats storage _planetDefaultStats = LibStorage.planetDefaultStats()[level];

        bool deadSpace = spaceType == SpaceType.DEAD_SPACE;
        bool deepSpace = spaceType == SpaceType.DEEP_SPACE;
        bool mediumSpace = spaceType == SpaceType.SPACE;

        _planet.owner = address(0);
        _planet.planetLevel = level;

        _planet.populationCap = _planetDefaultStats.populationCap;
        _planet.populationGrowth = _planetDefaultStats.populationGrowth;
        _planet.range = _planetDefaultStats.range;
        _planet.speed = _planetDefaultStats.speed;
        _planet.defense = _planetDefaultStats.defense;
        _planet.silverCap = _planetDefaultStats.silverCap;

        if (planetType == PlanetType.SILVER_MINE) {
            _planet.silverGrowth = _planetDefaultStats.silverGrowth;
        }

        if (LibGameUtils.isPopCapBoost(location)) {
            _planet.populationCap *= 2;
        }
        if (LibGameUtils.isPopGroBoost(location)) {
            _planet.populationGrowth *= 2;
        }
        if (LibGameUtils.isRangeBoost(location)) {
            _planet.range *= 2;
        }
        if (LibGameUtils.isSpeedBoost(location)) {
            _planet.speed *= 2;
        }
        if (LibGameUtils.isDefBoost(location)) {
            _planet.defense *= 2;
        }

        // space type buffs and debuffs
        if (deadSpace) {
            // dead space buff
            _planet.range = _planet.range * 2;
            _planet.speed = _planet.speed * 2;
            _planet.populationCap = _planet.populationCap * 2;
            _planet.populationGrowth = _planet.populationGrowth * 2;
            _planet.silverCap = _planet.silverCap * 2;
            _planet.silverGrowth = _planet.silverGrowth * 2;

            // dead space debuff
            _planet.defense = (_planet.defense * 3) / 20;
        } else if (deepSpace) {
            // deep space buff
            _planet.range = (_planet.range * 3) / 2;
            _planet.speed = (_planet.speed * 3) / 2;
            _planet.populationCap = (_planet.populationCap * 3) / 2;
            _planet.populationGrowth = (_planet.populationGrowth * 3) / 2;
            _planet.silverCap = (_planet.silverCap * 3) / 2;
            _planet.silverGrowth = (_planet.silverGrowth * 3) / 2;

            // deep space debuff
            _planet.defense = _planet.defense / 4;
        } else if (mediumSpace) {
            // buff
            _planet.range = (_planet.range * 5) / 4;
            _planet.speed = (_planet.speed * 5) / 4;
            _planet.populationCap = (_planet.populationCap * 5) / 4;
            _planet.populationGrowth = (_planet.populationGrowth * 5) / 4;
            _planet.silverCap = (_planet.silverCap * 5) / 4;
            _planet.silverGrowth = (_planet.silverGrowth * 5) / 4;

            // debuff
            _planet.defense = _planet.defense / 2;
        }

        // apply buffs/debuffs for nonstandard planets
        // generally try to make division happen later than multiplication to avoid weird rounding
        _planet.planetType = planetType;

        if (planetType == PlanetType.SILVER_MINE) {
            _planet.silverCap *= 2;
            _planet.defense /= 2;
        } else if (planetType == PlanetType.SILVER_BANK) {
            _planet.speed /= 2;
            _planet.silverCap *= 10;
            _planet.populationGrowth = 0;
            _planet.populationCap *= 5;
        } else if (planetType == PlanetType.TRADING_POST) {
            _planet.defense /= 2;
            _planet.silverCap *= 2;
        }

        // initial population (pirates) and silver
        _planet.population =
            (_planet.populationCap * _planetDefaultStats.barbarianPercentage) /
            100;

        // pirates adjusted for def debuffs, and buffed in space/deepspace
        if (deadSpace) {
            _planet.population *= 20;
        } else if (deepSpace) {
            _planet.population *= 10;
        } else if (mediumSpace) {
            _planet.population *= 4;
        }
        if (planetType == PlanetType.SILVER_BANK) {
            _planet.population /= 2;
        }

        // Adjust silver cap for mine
        if (planetType == PlanetType.SILVER_MINE) {
            _planet.silver = _planet.silverCap / 2;
        }

        // apply time factor
        _planet.speed =
            (_planet.speed * TIME_FACTOR_HUNDREDTHS * arenaConstants().SPEED_MULTIPLIER) /
            100 /
            100;
        require(_planet.speed != 0, "planet.speed cannot be zero");
        _planet.populationGrowth = (_planet.populationGrowth * TIME_FACTOR_HUNDREDTHS * arenaConstants().POP_GROWTH_MULTIPLIER) / 100 / 100;

        _planet.silverGrowth = (_planet.silverGrowth * TIME_FACTOR_HUNDREDTHS * arenaConstants().SILVER_GROWTH_MULTIPLIER) / 100 / 100;

        //apply other factors

        _planet.populationCap = (_planet.populationCap * arenaConstants().POP_CAP_MULTIPLIER) / 100;

        _planet.silverCap = (_planet.silverCap * arenaConstants().SILVER_CAP_MULTIPLIER) / 100;

        _planet.range = (_planet.range * arenaConstants().RANGE_MULTIPLIER) / 100;
        require(_planet.range != 0, "planet.range cannot be zero");

        _planet.defense = (_planet.defense * arenaConstants().DEFENSE_MULTIPLIER) / 100;
    }
}
