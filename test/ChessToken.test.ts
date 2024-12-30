const {
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { expect } = require("chai");
const hre = require("hardhat");

describe("ChessToken", function () {
  // Define variables in the outer scope of the test suite
  let chessToken: any;
  let owner;
  let addr1;
  let addr2;
  let initialSupply: bigint;
  const initialSupplyValue = "1000000000"; // Initial supply as a string for parsing

  // Fixture to deploy the ChessToken contract
  async function deployChessTokenFixture() {
    [owner, addr1, addr2] = await hre.ethers.getSigners();
    initialSupply = hre.ethers.parseUnits(initialSupplyValue, 18);

    chessToken = await hre.ethers.deployContract("ChessToken", [initialSupply]);

    return { chessToken, owner, addr1, addr2, initialSupply };
  }

  // Group tests related to deployment
  describe("Deployment", function () {
    // Load the fixture before each test in this block
    beforeEach(async function () {
      ({ chessToken, owner, initialSupply } = await loadFixture(
        deployChessTokenFixture
      ));
    });

    it("Should set the correct initial total supply", async function () {
      const totalSupply = await chessToken.totalSupply();
      expect(totalSupply).to.equal(initialSupply);
    });

    it("Should assign the entire initial supply to the owner", async function () {
      const ownerBalance = await chessToken.balanceOf(owner.address);
      expect(ownerBalance).to.equal(initialSupply);
    });

    it("Should have the correct token name", async function () {
      const name = await chessToken.name();
      expect(name).to.equal("ChessToken");
    });

    it("Should have the correct token symbol", async function () {
      const symbol = await chessToken.symbol();
      expect(symbol).to.equal("CHESS");
    });

    it("Should set the owner correctly", async function () {
      const contractOwner = await chessToken.owner();
      expect(contractOwner).to.equal(owner.address);
    });
  });

  // Group tests related to setting the ChessFactory
  describe("Setting ChessFactory", function () {
    beforeEach(async function () {
      ({ chessToken, owner, addr1 } = await loadFixture(
        deployChessTokenFixture
      ));
    });

    it("Should allow the owner to set the ChessFactory address", async function () {
      await expect(chessToken.connect(owner).setChessFactory(addr1.address))
        .to.emit(chessToken, "ChessFactorySet")
        .withArgs(hre.ethers.ZeroAddress, addr1.address);

      const chessFactory = await chessToken.chessFactory();
      expect(chessFactory).to.equal(addr1.address);
    });

    it("Should emit ChessFactorySet event with previous and new factory addresses", async function () {
      // First set
      await chessToken.connect(owner).setChessFactory(addr1.address);
      // Update to addr2
      await expect(chessToken.connect(owner).setChessFactory(addr2.address))
        .to.emit(chessToken, "ChessFactorySet")
        .withArgs(addr1.address, addr2.address);

      const chessFactory = await chessToken.chessFactory();
      expect(chessFactory).to.equal(addr2.address);
    });

    it("Should revert when a non-owner tries to set the ChessFactory address", async function () {
      await expect(
        chessToken.connect(addr1).setChessFactory(addr2.address)
      ).to.be.revertedWithCustomError(chessToken, "OwnableUnauthorizedAccount");
    });

    it("Should revert when setting the ChessFactory address to zero", async function () {
      await expect(
        chessToken.connect(owner).setChessFactory(hre.ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(chessToken, "InvalidAddress");
    });
  });

  // Group tests related to minting functionality
  describe("Minting", function () {
    // Define additional variables specific to minting tests
    let mintAmount;

    // Load the fixture and set the ChessFactory before each test in this block
    beforeEach(async function () {
      ({ chessToken, owner, addr1, addr2 } = await loadFixture(
        deployChessTokenFixture
      ));

      // Set addr1 as the ChessFactory
      await chessToken.connect(owner).setChessFactory(addr1.address);

      // Define the mint amount
      mintAmount = hre.ethers.parseUnits("100", 18);
    });

    it("Should allow the ChessFactory to mint tokens to a specified address", async function () {
      // Mint tokens from ChessFactory (addr1) to addr2
      await chessToken.connect(addr1).mintTokens(addr2.address, mintAmount);

      // Check the balance of addr2
      const addr2Balance = await chessToken.balanceOf(addr2.address);
      expect(addr2Balance).to.equal(mintAmount);

      // Check the total supply has increased
      const totalSupply = await chessToken.totalSupply();
      expect(totalSupply).to.equal(initialSupply + mintAmount);
    });

    it("Should emit Transfer event from zero address when minting tokens", async function () {
      await expect(
        chessToken.connect(addr1).mintTokens(addr2.address, mintAmount)
      )
        .to.emit(chessToken, "Transfer")
        .withArgs(hre.ethers.ZeroAddress, addr2.address, mintAmount);
    });

    it("Should revert when a non-ChessFactory tries to mint tokens", async function () {
      await expect(
        chessToken.connect(owner).mintTokens(addr2.address, mintAmount)
      ).to.be.revertedWithCustomError(chessToken, "OnlyChessFactoryCanMint");
    });

    it("Should revert when minting to the zero address", async function () {
      await expect(
        chessToken
          .connect(addr1)
          .mintTokens(hre.ethers.ZeroAddress, mintAmount)
      ).to.be.revertedWithCustomError(chessToken, "InvalidRecipientAddress");
    });

    it("Should revert when minting zero tokens", async function () {
      await expect(
        chessToken.connect(addr1).mintTokens(addr2.address, 0)
      ).to.be.revertedWithCustomError(
        chessToken,
        "AmountMustBeGreaterThanZero"
      );
    });
  });

  // Group tests related to burning functionality
  describe("Burning", function () {
    let burnAmount;

    beforeEach(async function () {
      ({ chessToken, owner, addr1 } = await loadFixture(
        deployChessTokenFixture
      ));

      // Define the burn amount
      burnAmount = hre.ethers.parseUnits("50", 18);
    });

    it("Should allow token holders to burn their own tokens", async function () {
      // Owner burns tokens
      await chessToken.connect(owner).burn(burnAmount);

      // Check the owner's balance
      const ownerBalance = await chessToken.balanceOf(owner.address);
      expect(ownerBalance).to.equal(initialSupply - burnAmount);

      // Check the total supply has decreased
      const totalSupply = await chessToken.totalSupply();
      expect(totalSupply).to.equal(initialSupply - burnAmount);
    });

    it("Should emit Transfer event to zero address when burning tokens", async function () {
      await expect(chessToken.connect(owner).burn(burnAmount))
        .to.emit(chessToken, "Transfer")
        .withArgs(owner.address, hre.ethers.ZeroAddress, burnAmount);
    });

    it("Should revert when trying to burn more tokens than the balance", async function () {
      const excessiveBurnAmount = hre.ethers.parseUnits("10000000000", 18);
      await expect(
        chessToken.connect(owner).burn(excessiveBurnAmount)
      ).to.be.revertedWith("Burn amount exceeds balance");
    });

    it("Should revert when trying to burn zero tokens", async function () {
      await expect(
        chessToken.connect(owner).burn(0)
      ).to.be.revertedWithCustomError(
        chessToken,
        "AmountMustBeGreaterThanZero"
      );
    });

    it("Should allow multiple accounts to burn their tokens independently", async function () {
      // Transfer some tokens to addr1
      const transferAmount = hre.ethers.parseUnits("200", 18);
      await chessToken.connect(owner).transfer(addr1.address, transferAmount);

      // addr1 burns some tokens
      const addr1BurnAmount = hre.ethers.parseUnits("100", 18);
      await chessToken.connect(addr1).burn(addr1BurnAmount);
      // Check addr1's balance
      const addr1Balance = await chessToken.balanceOf(addr1.address);
      expect(addr1Balance).to.equal(hre.ethers.parseUnits("100", 18));

      // Check total supply
      const totalSupply = await chessToken.totalSupply();
      const expectedTotalSupply = hre.ethers.parseUnits("999999900", 18);
      expect(totalSupply).to.equal(expectedTotalSupply);
    });
  });

  // Group tests related to receiving Ether
  describe("Receiving Ether", function () {
    it("Should reject incoming Ether transfers", async function () {
      await expect(
        owner.sendTransaction({
          to: chessToken.target,
          value: hre.ethers.parseEther("1"),
        })
      ).to.be.revertedWithCustomError(chessToken, "EtherNotAccepted");
    });

    it("Should have a receive function that reverts", async function () {
      const receiveData = "0x";

      await expect(
        owner.sendTransaction({
          to: chessToken.target,
          value: hre.ethers.parseEther("1"),
          data: receiveData,
        })
      ).to.be.revertedWithCustomError(chessToken, "EtherNotAccepted");
    });
  });
});
