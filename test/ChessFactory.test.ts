const {
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const hre = require("hardhat");

const DEFAULT_BET_AMOUNT = "1000";
const DEFAULT_INITIAL_BALANCE = "1000";

// ===============================
// =========== CONFIG ============
// ===============================

describe("ChessFactory", function () {
  async function deployFactoryFixture() {
    const [owner, addr1, addr2, addr3] = await hre.ethers.getSigners();
    const chessTemplate = await hre.ethers.deployContract("ChessTemplate");
    const chessToken = await hre.ethers.deployContract("ChessToken", [
      hre.ethers.parseUnits("1000000", 18),
    ]);
    const chessFactory = await hre.ethers.deployContract("ChessFactory", [
      chessTemplate.target,
    ]);

    await chessFactory.setChessToken(chessToken.target);
    const depositAmount = hre.ethers.parseUnits("100000", 18);
    await chessToken.approve(chessFactory.target, depositAmount);
    await chessFactory.ownerDepositTokens(depositAmount);

    return {
      chessFactory,
      chessTemplate,
      chessToken,
      owner,
      addr1,
      addr2,
      addr3,
    };
  }

  async function registerUser(chessFactory: any, user: any, pseudo = "Player") {
    await chessFactory.connect(user).registerUser(pseudo);
  }

  async function createGame(
    chessFactory: {
      connect: (arg0: any) => {
        (): any;
        new (): any;
        createGame: { (arg0: any, arg1: any): any; new (): any };
      };
      getGames: (arg0: number, arg1: number) => any;
    },
    owner: any,
    betAmount = DEFAULT_BET_AMOUNT,
    startOffset = 3600
  ) {
    const currentBlock = await hre.ethers.provider.getBlock("latest");
    const startTime = currentBlock.timestamp + startOffset;
    const betAmountUnits = hre.ethers.parseUnits(betAmount, 18);

    await chessFactory.connect(owner).createGame(betAmountUnits, startTime);

    const games = await chessFactory.getGames(0, 1);
    return games[0].gameAddress;
  }

  async function getGameDetails(chessFactory: any, gameAddress: string) {
    return await chessFactory.getGameDetails(gameAddress);
  }

  // ===============================
  // ======== INITIALIZATION =======
  // ===============================

  describe("Initialization", function () {
    let chessFactory: any;
    let chessToken: any;
    let chessTemplate: any;
    beforeEach(async function () {
      ({ chessFactory, chessToken, chessTemplate } = await loadFixture(
        deployFactoryFixture
      ));
    });
    it("Should set the correct ChessTemplate and ChessToken addresses", async function () {
      expect(await chessFactory.templateAddress()).to.equal(
        chessTemplate.target
      );
      expect(await chessFactory.chessTokenAddress()).to.equal(
        chessToken.target
      );
    });

    it("Should revert if trying to setChessToken to zero address", async function () {
      await expect(
        chessFactory.setChessToken(hre.ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(chessFactory, "InvalidChessTokenAddress");
    });
  });

  // ===============================
  // ========= MODIFIERS ===========
  // ===============================

  describe("Modifier: gameExists", function () {
    it("Should revert if the game does not exist", async function () {
      const { chessFactory, addr1 } = await loadFixture(deployFactoryFixture);

      // Génère une adresse aléatoire qui ne sera pas dans gameDetails
      const nonExistentGameAddress = hre.ethers.Wallet.createRandom().address;

      // Tente d’appeler une fonction (registerToGame) qui utilise le modifier gameExists
      await expect(
        chessFactory.connect(addr1).registerToGame(nonExistentGameAddress)
      ).to.be.revertedWithCustomError(chessFactory, "GameDoesNotExist");
    });
  });

  describe("Modifier: onlyUser", function () {
    let chessFactory: any;
    let addr1: any;
    beforeEach(async function () {
      ({ chessFactory, addr1 } = await loadFixture(deployFactoryFixture));
    });
    it("Should revert if the caller is not registered", async function () {
      // On s’assure qu’addr1 ne s’est pas enregistré
      // (pas de `registerUser` appelé pour addr1)

      // Ici, on appelle une fonction qui utilise le modifier `onlyUser`.
      // Par exemple : getUser() qui fait `onlyUser(msg.sender)`.
      await expect(
        chessFactory.connect(addr1).getUser()
      ).to.be.revertedWithCustomError(chessFactory, "UserNotRegistered");
    });

    it("Should pass if the caller is registered", async function () {
      // On enregistre addr1
      await chessFactory.connect(addr1).registerUser("Player1");

      // Maintenant, getUser() doit réussir et ne pas revert
      const user = await chessFactory.connect(addr1).getUser();
      expect(user.userAddress).to.equal(addr1.address);
    });
  });

  describe("Modifier: onlyPlayer", function () {
    let chessFactory: any;
    let owner: any;
    let addr1: any;
    let addr2: any;
    let addr3: any;
    beforeEach(async function () {
      ({ chessFactory, owner, addr1, addr2, addr3 } = await loadFixture(
        deployFactoryFixture
      ));
    });
    it("Should revert if the caller is not a participant of the game", async function () {
      // 1. Créer un game (par le owner).
      const gameAddress = await createGame(chessFactory, owner);

      // 2. Enregistrer deux utilisateurs (addr1 et addr2).
      await registerUser(chessFactory, addr1, "Player1");
      await registerUser(chessFactory, addr2, "Player2");

      // 3. Ces deux utilisateurs rejoignent la partie.
      await chessFactory.connect(addr1).registerToGame(gameAddress);
      await chessFactory.connect(addr2).registerToGame(gameAddress);

      // 4. Vérifier qu'un utilisateur non inscrit (addr3) ne peut pas appeler une fonction protégée par onlyPlayer.
      await expect(
        chessFactory.connect(addr3).joinGame(gameAddress)
      ).to.be.revertedWithCustomError(chessFactory, "NotParticipant");
    });

    it("Should allow if the caller is a participant of the game", async function () {
      // 1. Créer un jeu qui commence dans 3600 sec
      const gameAddress = await createGame(chessFactory, owner);

      // 2. Enregistrer deux utilisateurs
      await registerUser(chessFactory, addr1, "Player1");
      await registerUser(chessFactory, addr2, "Player2");

      // 3. Les deux utilisateurs rejoignent la partie
      await chessFactory.connect(addr1).registerToGame(gameAddress);
      await chessFactory.connect(addr2).registerToGame(gameAddress);

      // 4. Avancer le temps de 3601 secondes pour dépasser le startTime
      await hre.ethers.provider.send("evm_increaseTime", [3601]);
      await hre.ethers.provider.send("evm_mine", []);

      // 5. Appeler joinGame en tant que participant (addr1)
      //    => devrait NE PAS revert
      await expect(chessFactory.connect(addr1).joinGame(gameAddress)).not.to.be
        .reverted;
    });
  });

  // ===============================
  // ======== DEPOSITTOKENS ========
  // ===============================

  describe("depositTokens", function () {
    let chessFactory: any;
    let chessToken: any;
    let owner: any;
    beforeEach(async function () {
      ({ chessFactory, chessToken, owner } = await loadFixture(
        deployFactoryFixture
      ));
    });

    it("Should allow the owner to deposit ChessTokens", async function () {
      // Deposit additional tokens
      const depositAmount = hre.ethers.parseUnits("50000", 18);
      await chessToken.approve(chessFactory.target, depositAmount);
      await expect(chessFactory.ownerDepositTokens(depositAmount))
        .to.emit(chessFactory, "TokensDeposited")
        .withArgs(owner.address, depositAmount);

      // New platform balance
      const newBalance = await chessFactory.platformBalance();
      const expectedNewBalance = hre.ethers.parseUnits("150000", 18);

      // Verify the platform balance increased correctly
      expect(newBalance).to.equal(expectedNewBalance);
    });

    it("Should revert if the allowance is insufficient", async function () {
      // Montant de dépôt
      const depositAmount = hre.ethers.parseUnits("100", 18);

      // On s’assure de ne PAS approuver (ou d'approuver un montant inférieur) avant de tenter le dépôt
      // Par exemple : on approuve 0 ou on n'appelle pas du tout `approve`.
      await chessToken.approve(chessFactory.target, 0);

      // Tente de déposer sans allowance suffisante => revert attendu
      await expect(
        chessFactory.ownerDepositTokens(depositAmount)
      ).to.be.revertedWithCustomError(chessFactory, "InsufficientAllowance");
    });
  });

  // ===============================
  // ========= CREATEGAME ==========
  // ===============================

  describe("Game Creation", function () {
    let chessFactory: any;
    let owner: any;
    let addr1: any;
    beforeEach(async function () {
      ({ chessFactory, owner, addr1 } = await loadFixture(
        deployFactoryFixture
      ));
    });
    it("Should create a new game and register player", async function () {
      // Register user
      await registerUser(chessFactory, addr1, "Player1");

      // Create a new game
      const gameAddress = await createGame(chessFactory, owner);

      // Verify game creation
      const gameDetails = await getGameDetails(chessFactory, gameAddress);
      expect(gameDetails.gameAddress).to.not.equal(hre.ethers.ZeroAddress);
      expect(gameDetails.betAmount).to.equal(
        hre.ethers.parseUnits(DEFAULT_BET_AMOUNT, 18)
      );

      // Register to the game
      await chessFactory.connect(addr1).registerToGame(gameAddress);

      // Verify player registration
      const updatedGameDetails = await getGameDetails(
        chessFactory,
        gameAddress
      );
      expect(updatedGameDetails.player1.userAddress).to.equal(addr1.address);
    });

    it("Should revert if betAmount is zero", async function () {
      const currentBlock = await hre.ethers.provider.getBlock("latest");
      const startTime = currentBlock.timestamp + 3600;
      const betAmount = hre.ethers.parseUnits("0", 18); // Zero bet amount

      await expect(
        chessFactory.connect(owner).createGame(betAmount, startTime)
      ).to.be.revertedWithCustomError(chessFactory, "InvalidBetAmount");
    });

    it("Should revert if start time is in the past", async function () {
      const currentBlock = await hre.ethers.provider.getBlock("latest");
      const startTime = currentBlock.timestamp - 3600; // Past start time
      const betAmount = hre.ethers.parseUnits(DEFAULT_BET_AMOUNT, 18);

      await expect(
        chessFactory.connect(owner).createGame(betAmount, startTime)
      ).to.be.revertedWithCustomError(chessFactory, "StartTimeInPast");
    });

    it("Should revert if the templateAddress is zero in the constructor", async function () {
      const ChessFactory = await hre.ethers.getContractFactory("ChessFactory");

      await expect(
        ChessFactory.deploy(hre.ethers.ZeroAddress) // On tente le déploiement avec 0x0
      ).to.be.revertedWithCustomError(
        // Ici, on référence la factory, pas d’instance déployée
        ChessFactory,
        "InvalidTemplateAddress"
      );
    });
  });

  // ===============================
  // ====== DISTRIBUTEREWARDS ======
  // ===============================

  describe("Rewards Distribution", function () {
    let chessFactory: any;
    let owner: any;
    let addr1: any;
    let addr2: any;
    beforeEach(async function () {
      ({ chessFactory, owner, addr1, addr2 } = await loadFixture(
        deployFactoryFixture
      ));
    });
    it("Should distribute rewards to the winner", async function () {
      // Register users
      await registerUser(chessFactory, addr1, "Player1");
      await registerUser(chessFactory, addr2, "Player2");

      // Create a new game
      const gameAddress = await createGame(chessFactory, owner);

      // Users join the game
      await chessFactory.connect(addr1).registerToGame(gameAddress);
      await chessFactory.connect(addr2).registerToGame(gameAddress);

      // Simulate game end with addr1 as winner
      const platformFee = hre.ethers.parseUnits("500", 18);
      const reward = hre.ethers.parseUnits("1500", 18);

      await expect(
        chessFactory.distributeRewards(
          addr1.address,
          addr2.address,
          addr1.address, // Winner is addr1
          platformFee,
          reward
        )
      )
        .to.emit(chessFactory, "RewardsDistributed")
        .withArgs(
          addr1.address,
          addr2.address,
          addr1.address,
          platformFee,
          reward
        );

      // Check balances
      const user1 = await chessFactory.connect(addr1).getUser();
      const user2 = await chessFactory.connect(addr2).getUser();
      const platformBalance = await chessFactory.platformBalance();

      expect(user1.balance).to.equal(hre.ethers.parseUnits("1500", 18)); // 1000 initial - betAmount 1000 + 1500 reward
      expect(user2.balance).to.equal(0); // 1000 initial - betAmount 1000
      expect(platformBalance).to.equal(hre.ethers.parseUnits("100500", 18)); // 100000 initial + 500 fee
    });

    it("Should distribute rewards to both players in case of a draw", async function () {
      // Register users
      await registerUser(chessFactory, addr1, "Player1");
      await registerUser(chessFactory, addr2, "Player2");

      // Create a new game
      const gameAddress = await createGame(chessFactory, owner);

      // Users join the game
      await chessFactory.connect(addr1).registerToGame(gameAddress);
      await chessFactory.connect(addr2).registerToGame(gameAddress);

      // Simulate game end with a draw
      const platformFee = hre.ethers.parseUnits("500", 18);
      const reward = hre.ethers.parseUnits("750", 18); // Each player gets 750
      await chessFactory.distributeRewards(
        addr1.address,
        addr2.address,
        hre.ethers.ZeroAddress, // Draw
        platformFee,
        reward
      );

      // Check balances
      const user1 = await chessFactory.connect(addr1).getUser();
      const user2 = await chessFactory.connect(addr2).getUser();
      const platformBalance = await chessFactory.platformBalance();

      expect(user1.balance).to.equal(hre.ethers.parseUnits("750", 18)); // 1000 initial - 1000 betAmount + 750 reward
      expect(user2.balance).to.equal(hre.ethers.parseUnits("750", 18)); // 1000 initial - 1000 betAmount + 750 reward
      expect(platformBalance).to.equal(hre.ethers.parseUnits("100500", 18)); // 10000 initial + 500 fee
    });

    it("Should revert if platform balance is insufficient for rewards", async function () {
      // Register users
      await registerUser(chessFactory, addr1, "Player1");
      await registerUser(chessFactory, addr2, "Player2");

      // Create a new game
      const gameAddress = await createGame(chessFactory, owner);

      // Users join the game
      await chessFactory.connect(addr1).registerToGame(gameAddress);
      await chessFactory.connect(addr2).registerToGame(gameAddress);

      // Simulate game end with addr1 as winner but insufficient platform balance
      const platformFee = hre.ethers.parseUnits("500000", 18); // Exceeds current platform balance
      const reward = hre.ethers.parseUnits("1000", 18);

      await expect(
        chessFactory.distributeRewards(
          addr1.address,
          addr2.address,
          addr1.address,
          platformFee,
          reward
        )
      ).to.be.revertedWithCustomError(
        chessFactory,
        "InsufficientPlatformBalance"
      );
    });

    it("Should revert with UserNotRegistered if player1 or player2 is zero address", async function () {
      const { chessFactory, addr1 } = await loadFixture(deployFactoryFixture);

      // On définit player1 ou player2 à zero address
      const player1 = hre.ethers.ZeroAddress;
      const player2 = addr1.address;

      const platformFee = hre.ethers.parseUnits("100", 18);
      const reward = hre.ethers.parseUnits("100", 18);

      await expect(
        chessFactory.distributeRewards(
          player1,
          player2,
          hre.ethers.ZeroAddress,
          platformFee,
          reward
        )
      ).to.be.revertedWithCustomError(chessFactory, "UserNotRegistered");
    });

    it("Should revert with WinnerNotRegistered if winner is not zero but not registered", async function () {
      const { chessFactory, addr1, addr2, addr3 } = await loadFixture(
        deployFactoryFixture
      );

      // Seuls addr1 et addr2 sont enregistrés
      await registerUser(chessFactory, addr1, "Player1");
      await registerUser(chessFactory, addr2, "Player2");

      // addr3 N'EST PAS enregistré => winner non enregistré
      const platformFee = hre.ethers.parseUnits("50", 18);
      const reward = hre.ethers.parseUnits("100", 18);

      await expect(
        chessFactory.distributeRewards(
          addr1.address,
          addr2.address,
          addr3.address,
          platformFee,
          reward
        )
      ).to.be.revertedWithCustomError(chessFactory, "WinnerNotRegistered");
    });
  });

  // ===============================
  // ======== WITHDRAWTOKENS =======
  // ===============================

  describe("Withdraw ChessTokens", function () {
    let chessFactory: any;
    let owner: any;
    let addr1: any;
    let chessToken: any;
    beforeEach(async function () {
      ({ chessFactory, owner, addr1, chessToken } = await loadFixture(
        deployFactoryFixture
      ));
    });
    it("Should allow the owner to withdraw ChessTokens", async function () {
      await chessFactory.connect(addr1).registerUser("Player1");

      const withdrawAmount = hre.ethers.parseUnits("1000", 18);
      await chessFactory.connect(addr1).withdrawTokens(withdrawAmount);

      // Check owner's ChessToken balance
      const ownerBalance = await chessToken.balanceOf(owner.address);
      expect(ownerBalance).to.equal(hre.ethers.parseUnits("900000", 18));
    });

    it("Should revert if withdrawing more ChessTokens than the platform balance", async function () {
      await chessFactory.connect(addr1).registerUser("Player1");
      // Attempt to withdraw more tokens than available
      const withdrawAmount = hre.ethers.parseUnits("200000", 18); // Platform balance is 10000
      await expect(
        chessFactory.connect(addr1).withdrawTokens(withdrawAmount)
      ).to.be.revertedWithCustomError(chessFactory, "InsufficientChessBalance");
    });
  });

  // ===============================
  // ======== WITHDRAWALLETHER ========
  // ===============================

  describe("Withdraw Ether", function () {
    let chessFactory: any;
    let owner: any;
    let addr1: any;
    beforeEach(async function () {
      ({ chessFactory, owner, addr1 } = await loadFixture(
        deployFactoryFixture
      ));
    });
    it("Should allow the owner to withdraw Ethers", async function () {
      // Send some Ether to the contract for withdrawal
      const sendAmount = hre.ethers.parseEther("10");
      await owner.sendTransaction({
        to: chessFactory.target,
        value: sendAmount,
      });

      await chessFactory.withdrawAllEther();

      // Check the contract's Ether balance
      const contractBalance = await hre.ethers.provider.getBalance(
        chessFactory.target
      );
      expect(contractBalance).to.equal(hre.ethers.parseEther("0"));
    });

    it("Should revert if non-owner tries to withdraw Ethers", async function () {
      await expect(
        chessFactory.connect(addr1).withdrawAllEther()
      ).to.be.revertedWithCustomError(
        chessFactory,
        "OwnableUnauthorizedAccount"
      );
    });

    it("Should revert if withdrawing more Ethers than the contract balance", async function () {
      await expect(
        chessFactory.withdrawAllEther()
      ).to.be.revertedWithCustomError(
        chessFactory,
        "InsufficientContractBalance"
      );
    });
  });

  // ===============================
  // ========= REGISTERUSER ========
  // ===============================

  describe("User Registration", function () {
    let chessFactory: any;
    let addr1: any;
    beforeEach(async function () {
      ({ chessFactory, addr1 } = await loadFixture(deployFactoryFixture));
    });
    it("Should register a new user", async function () {
      // Register user
      await registerUser(chessFactory, addr1, "Player1");

      // Retrieve user details
      const user = await chessFactory.connect(addr1).getUser();

      // Verify user details
      expect(user.userAddress).to.equal(addr1.address);
      expect(user.pseudo).to.equal("Player1");
      expect(user.balance).to.equal(
        hre.ethers.parseUnits(DEFAULT_INITIAL_BALANCE, 18)
      );
    });

    it("Should revert if user tries to register twice", async function () {
      // Register user once
      await registerUser(chessFactory, addr1, "Player1");

      // Attempt to register again
      await expect(
        chessFactory.connect(addr1).registerUser("Player1")
      ).to.be.revertedWithCustomError(chessFactory, "UserAlreadyRegistered");
    });

    it("Should revert if pseudo is empty", async function () {
      // Attempt to register with empty pseudo
      await expect(
        chessFactory.connect(addr1).registerUser("")
      ).to.be.revertedWithCustomError(chessFactory, "EmptyPseudo");
    });
    it("Should revert if platformBalance < 1000 * 1e18 (InsufficientPlatformBalance)", async function () {
      // Pour forcer le balance de la plateforme à être insuffisant, on retire tous les tokens
      await chessFactory.withdrawAllChessTokens();

      // Vérifions qu'il ne reste vraiment plus rien
      const newPlatformBalance = await chessFactory.platformBalance();
      expect(newPlatformBalance).to.equal(0);

      // Maintenant, essayer de registerUser => revert attendu
      await expect(
        chessFactory.connect(addr1).registerUser("NewPlayer")
      ).to.be.revertedWithCustomError(
        chessFactory,
        "InsufficientPlatformBalance"
      );
    });
  });

  // ===============================
  // ========= BUYCHESSTOKENS ========
  // ===============================

  describe("buyChessTokens", function () {
    let chessFactory: any;
    let addr1: any;
    beforeEach(async function () {
      ({ chessFactory, addr1 } = await loadFixture(deployFactoryFixture));
    });

    it("should revert if the amount of Ether is zero", async function () {
      await chessFactory.connect(addr1).registerUser("Player1");
      await expect(
        chessFactory.connect(addr1).buyChessTokens(0)
      ).to.be.revertedWithCustomError(chessFactory, "InvalidEthAmount");
    });

    it("should revert if the sent Ether does not match the specified amountInEth", async function () {
      const amountInEth = hre.ethers.parseEther("1");
      await chessFactory.connect(addr1).registerUser("Player1");

      await expect(
        chessFactory.connect(addr1).buyChessTokens(amountInEth)
      ).to.be.revertedWithCustomError(chessFactory, "InvalidEthAmount");
    });
  });

  // ===============================
  // ======= REGISTERTOGAME ========
  // ===============================

  describe("registerToGame", function () {
    let chessFactory: any;
    let owner: any;
    let addr1: any;
    let addr2: any;
    let addr3: any;
    beforeEach(async function () {
      ({ chessFactory, owner, addr1, addr2, addr3 } = await loadFixture(
        deployFactoryFixture
      ));
    });
    it("Should allow users to join a game", async function () {
      // Register users
      await registerUser(chessFactory, addr1, "Player1");
      await registerUser(chessFactory, addr2, "Player2");

      // Create a new game
      const gameAddress = await createGame(chessFactory, owner);

      // Users join the game
      await chessFactory.connect(addr1).registerToGame(gameAddress);
      await chessFactory.connect(addr2).registerToGame(gameAddress);

      // Retrieve updated game details
      const gameDetails = await getGameDetails(chessFactory, gameAddress);

      // Verify both players are registered
      expect(gameDetails.player1.userAddress).to.equal(addr1.address);
      expect(gameDetails.player2.userAddress).to.equal(addr2.address);
    });

    it("Should revert if non-registered user tries to register to a game", async function () {
      // Register only addr1
      await registerUser(chessFactory, addr1, "Player1");

      // Create a new game
      const gameAddress = await createGame(chessFactory, owner);

      // Attempt to register addr2 without registering
      await expect(
        chessFactory.connect(addr2).registerToGame(gameAddress)
      ).to.be.revertedWithCustomError(chessFactory, "UserNotRegistered");
    });

    it("should revert if the game is already full", async function () {
      // 1. Crée une partie pour "dans 1 heure"
      const gameAddress = await createGame(chessFactory, owner, "1000", 3600);

      // 2. Inscrit 2 joueurs => la partie devient 'active'
      await registerUser(chessFactory, addr1, "Player1");
      await registerUser(chessFactory, addr2, "Player2");
      await registerUser(chessFactory, addr3, "Player3");
      await chessFactory.connect(addr1).registerToGame(gameAddress);
      await chessFactory.connect(addr2).registerToGame(gameAddress);

      await expect(
        chessFactory.connect(addr3).registerToGame(gameAddress)
      ).to.be.revertedWithCustomError(chessFactory, "GameAlreadyFull");
    });

    it("should revert if the user has insufficient balance", async function () {
      const gameAddress = await createGame(chessFactory, owner, "1000", 3600);
      await registerUser(chessFactory, addr1, "Player1");
      await chessFactory.connect(addr1).registerToGame(gameAddress);

      const gameAddress2 = await createGame(chessFactory, owner, "1000", 3600);

      await expect(
        chessFactory.connect(addr1).registerToGame(gameAddress2)
      ).to.be.revertedWithCustomError(chessFactory, "InsufficientChessBalance");
    });
  });

  // ===============================
  // ========== JOINGAME ===========
  // ===============================

  describe("joinGame", function () {
    let chessFactory: any;
    let owner: any;
    let addr1: any;
    let addr2: any;
    beforeEach(async function () {
      ({ chessFactory, owner, addr1, addr2 } = await loadFixture(
        deployFactoryFixture
      ));
    });
    it("Should revert with InactiveGame if the game is not active", async function () {
      // 1. Crée une partie
      const gameAddress = await createGame(chessFactory, owner);

      // 2. Inscrit UN seul joueur (addr1)
      //    => Le game ne deviendra pas 'active', car la factory n'appellera setGameActive() qu'après
      //       inscription des 2 joueurs.
      await registerUser(chessFactory, addr1, "Player1");
      await chessFactory.connect(addr1).registerToGame(gameAddress);

      // 3. Tente de démarrer la partie
      //    => revert attendu, car la game n'est pas active (un seul joueur inscrit).
      await expect(
        chessFactory.connect(addr1).joinGame(gameAddress)
      ).to.be.revertedWithCustomError(chessFactory, "InactiveGame");
    });

    it("Should revert with StartTimeInPast if the current time is earlier than game.startTime", async function () {
      // 1. Crée une partie pour "dans 1 heure"
      const gameAddress = await createGame(chessFactory, owner, "1000", 3600);

      // 2. Inscrit 2 joueurs => la partie devient 'active'
      await registerUser(chessFactory, addr1, "Player1");
      await registerUser(chessFactory, addr2, "Player2");
      await chessFactory.connect(addr1).registerToGame(gameAddress);
      await chessFactory.connect(addr2).registerToGame(gameAddress);

      // 3. Tente d'appeler joinGame immédiatement, alors que
      //    block.timestamp < startTime => revert "StartTimeInPast".
      await expect(
        chessFactory.connect(addr1).joinGame(gameAddress)
      ).to.be.revertedWithCustomError(chessFactory, "StartTimeInPast");
    });
  });

  // ===============================
  // ========== GETUSERS ===========
  // ===============================

  describe("getUsers", function () {
    let chessFactory: any;
    let addr1: any;
    let addr2: any;
    let addr3: any;
    beforeEach(async function () {
      ({ chessFactory, addr1, addr2, addr3 } = await loadFixture(
        deployFactoryFixture
      ));
    });
    it("Should revert with StartIndexOutOfBounds if start >= userAddresses.length", async function () {
      // Aucune inscription => userAddresses.length = 0
      // On tente de récupérer les utilisateurs en commençant à l'index 0,
      // alors que le tableau est vide => startIndexOutOfBounds
      await expect(chessFactory.getUsers(0, 1)).to.be.revertedWithCustomError(
        chessFactory,
        "StartIndexOutOfBounds"
      );
    });

    it("should handle the case when start + count exactly equals the user list length", async function () {
      // Register three users
      await chessFactory.connect(addr1).registerUser("User1");
      await chessFactory.connect(addr2).registerUser("User2");
      await chessFactory.connect(addr3).registerUser("User3");

      // Call getUsers where start + count equals the total number of users
      const users = await chessFactory.getUsers(1, 2);

      // Verify the returned users
      expect(users.length).to.equal(2);
      expect(users[0][1]).to.equal("User2");
      expect(users[1][1]).to.equal("User3");
    });
  });

  // ===============================
  // ========== GETGAMES ===========
  // ===============================

  describe("getGames", function () {
    let chessFactory: any;
    beforeEach(async function () {
      ({ chessFactory } = await loadFixture(deployFactoryFixture));
    });
    describe("getGames", function () {
      it("Should revert with StartIndexOutOfBounds if start >= games.length", async function () {
        // Aucune partie créée => games.length = 0
        // On tente de récupérer les games en commençant à l'index 0,
        // alors que le tableau est vide => StartIndexOutOfBounds
        await expect(chessFactory.getGames(0, 1)).to.be.revertedWithCustomError(
          chessFactory,
          "StartIndexOutOfBounds"
        );
      });
    });
  });
});
