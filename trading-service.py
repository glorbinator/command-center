#!/usr/bin/env python3
"""
Glorb Trader Service - Integrated with Command Center
Provides trading recommendations via HTTP API for the Node.js command center
"""

import sys
import json
import logging
import os
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime
from typing import Dict, List, Optional
from dataclasses import dataclass
import threading
import hashlib
import secrets

# Add parent directory to path for glorb-trader imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import trading modules from glorb-trader
try:
    from glorb_trader.kalshi_client import KalshiClient
    from glorb_trader.kraken_client import KrakenClient
    from glorb_trader.config import (
        KALSHI_API_KEY_ID, KALSHI_PRIVATE_KEY,
        KRAKEN_API_KEY, KRAKEN_PRIVATE_KEY,
        DEFAULT_TRADE_SIZE_USD, CONFIRM_TRADES
    )
    TRADING_AVAILABLE = True
except ImportError as e:
    print(f"Warning: Could not import trading modules: {e}")
    TRADING_AVAILABLE = False
    KALSHI_API_KEY_ID = None
    KRAKEN_API_KEY = None

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Command center integration
COMMAND_CENTER_URL = os.environ.get('COMMAND_CENTER_URL', 'http://localhost:3456')

@dataclass
class TradeSuggestion:
    """Represents a trading recommendation."""
    market: str  # 'kalshi' or 'kraken'
    symbol: str
    side: str
    amount: float
    price: float
    confidence: float
    reasoning: str
    timestamp: str
    id: str = None
    
    def __post_init__(self):
        if self.id is None:
            self.id = f"trade_{self.market}_{self.symbol}_{int(datetime.now().timestamp())}"


# ============ AUTHENTICATION ============

# Simple user database (in production, use a real database)
USERS = {
    "admin": {
        "password_hash": hashlib.sha256("glorb2024".encode()).hexdigest(),
        "role": "admin"
    },
    "glorb": {
        "password_hash": hashlib.sha256("trader123".encode()).hexdigest(),
        "role": "user"
    }
}

def verify_password(username: str, password: str) -> bool:
    """Verify username and password."""
    if username not in USERS:
        return False
    stored_hash = USERS[username]['password_hash']
    return hashlib.sha256(password.encode()).hexdigest() == stored_hash

def generate_session_token() -> str:
    """Generate a session token."""
    return secrets.token_hex(32)

# Session store
active_sessions = {}


# ============ TRADING SERVICE ============

class TradingService:
    """Trading service that integrates with the command center."""
    
    def __init__(self):
        self.pending_trades = {}
        self.executed_trades = []
        self.config = {
            'trade_size': DEFAULT_TRADE_SIZE_USD if TRADING_AVAILABLE else 100,
            'confirm_trades': CONFIRM_TRADES if TRADING_AVAILABLE else True,
            'enabled': True
        }
        
        if TRADING_AVAILABLE and KALSHI_API_KEY_ID:
            try:
                self.kalshi = KalshiClient(KALSHI_API_KEY_ID, KALSHI_PRIVATE_KEY)
                logger.info("Kalshi client initialized")
            except Exception as e:
                logger.error(f"Failed to initialize Kalshi client: {e}")
                self.kalshi = None
        else:
            self.kalshi = None
            logger.warning("Kalshi client not available - missing credentials")
            
        if TRADING_AVAILABLE and KRAKEN_API_KEY:
            try:
                self.kraken = KrakenClient(KRAKEN_API_KEY, KRAKEN_PRIVATE_KEY)
                logger.info("Kraken client initialized")
            except Exception as e:
                logger.error(f"Failed to initialize Kraken client: {e}")
                self.kraken = None
        else:
            self.kraken = None
            logger.warning("Kraken client not available - missing credentials")
    
    def get_kalshi_recommendations(self) -> List[TradeSuggestion]:
        """Fetch and analyze Kalshi markets."""
        suggestions = []
        
        if not TRADING_AVAILABLE or not self.kalshi:
            logger.warning("Kalshi client not available")
            return suggestions
        
        try:
            markets = self.kalshi.get_markets(status="active")
            
            for market in markets[:20]:
                market_id = market.get('id')
                title = market.get('title', 'Unknown')
                current_price = market.get('current_price', 0.5)
                volume = market.get('volume', 0)
                
                if volume < 1000:
                    continue
                
                confidence = abs(current_price - 0.5) * 2
                
                suggestion = TradeSuggestion(
                    market='kalshi',
                    symbol=market_id,
                    side='yes' if current_price > 0.5 else 'no',
                    amount=self.config['trade_size'],
                    price=current_price,
                    confidence=confidence,
                    reasoning=f"Title: {title}\nPrice: {current_price:.2%}\nVolume: {volume}",
                    timestamp=datetime.now().isoformat()
                )
                suggestions.append(suggestion)
                
        except Exception as e:
            logger.error(f"Error fetching Kalshi: {e}")
        
        return suggestions
    
    def get_kraken_recommendations(self, symbols: List[str] = None) -> List[TradeSuggestion]:
        """Fetch and analyze Kraken markets."""
        suggestions = []
        
        if not TRADING_AVAILABLE or not self.kraken:
            logger.warning("Kraken client not available")
            return suggestions
        
        if symbols is None:
            symbols = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'ADA/USD']
        
        try:
            for symbol in symbols:
                ticker = self.kraken.get_ticker(symbol)
                if not ticker:
                    continue
                
                last = ticker.get('last', 0)
                change = ticker.get('change', 0)
                volume = ticker.get('volume', 0)
                
                if volume < 10:
                    continue
                
                if abs(change) < 2:
                    continue
                
                confidence = min(abs(change) / 10, 1.0)
                
                suggestion = TradeSuggestion(
                    market='kraken',
                    symbol=symbol,
                    side='buy' if change > 0 else 'sell',
                    amount=self.config['trade_size'] / last,
                    price=last,
                    confidence=confidence,
                    reasoning=f"Symbol: {symbol}\nPrice: ${last:.2f}\n24h Change: {change:.2f}%\nVolume: {volume}",
                    timestamp=datetime.now().isoformat()
                )
                suggestions.append(suggestion)
                
        except Exception as e:
            logger.error(f"Error fetching Kraken: {e}")
        
        return suggestions
    
    def get_all_recommendations(self) -> List[TradeSuggestion]:
        """Get recommendations from all markets."""
        all_suggestions = []
        all_suggestions.extend(self.get_kalshi_recommendations())
        all_suggestions.extend(self.get_kraken_recommendations())
        all_suggestions.sort(key=lambda x: x.confidence, reverse=True)
        return all_suggestions
    
    def get_balances(self) -> Dict:
        """Get account balances."""
        balances = {'kalshi': {}, 'kraken': {}}
        
        if TRADING_AVAILABLE:
            try:
                if self.kalshi:
                    balances['kalshi'] = self.kalshi.get_balance()
            except Exception as e:
                logger.error(f"Error getting Kalshi balance: {e}")
            
            try:
                if self.kraken:
                    balances['kraken'] = self.kraken.get_balance()
            except Exception as e:
                logger.error(f"Error getting Kraken balance: {e}")
        
        return balances
    
    def execute_trade(self, suggestion: TradeSuggestion) -> bool:
        """Execute a trade."""
        if not TRADING_AVAILABLE:
            logger.warning("Trading not available")
            return False
        
        try:
            if suggestion.market == 'kalshi':
                result = self.kalshi.place_order(
                    market_id=suggestion.symbol,
                    side=suggestion.side,
                    amount=suggestion.amount,
                    order_type='market'
                )
                logger.info(f"Kalshi order executed: {result}")
                return True
                
            elif suggestion.market == 'kraken':
                result = self.kraken.place_order(
                    symbol=suggestion.symbol,
                    side=suggestion.side,
                    amount=suggestion.amount,
                    order_type='market'
                )
                logger.info(f"Kraken order executed: {result}")
                return True
                
        except Exception as e:
            logger.error(f"Error executing trade: {e}")
            return False
        
        return False
    
    def update_config(self, new_config: Dict):
        """Update trading configuration."""
        self.config.update(new_config)
        logger.info(f"Config updated: {self.config}")
    
    def get_config(self) -> Dict:
        """Get current configuration."""
        return self.config


# Global trading service instance
trading_service = TradingService()


# ============ HTTP API HANDLER ============

class TradingAPIHandler(BaseHTTPRequestHandler):
    """HTTP API handler for trading service."""
    
    def log_message(self, format, *args):
        logger.info(f"{self.address_string()} - {format % args}")
    
    def send_json_response(self, status_code: int, data: dict):
        """Send JSON response."""
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    
    def get_session_user(self) -> Optional[str]:
        """Get the user from the session token."""
        auth_header = self.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]
            if token in active_sessions:
                return active_sessions[token]
        return None
    
    def require_auth(self) -> bool:
        """Check if the request is authenticated."""
        # Skip auth for login endpoint
        if self.path == '/api/auth/login':
            return True
        
        user = self.get_session_user()
        if not user:
            self.send_json_response(401, {'error': 'Unauthorized'})
            return False
        return True
    
    def do_GET(self):
        """Handle GET requests."""
        path = self.path.split('?')[0]
        
        if path == '/api/trading/recommendations':
            if not self.require_auth():
                return
            suggestions = trading_service.get_all_recommendations()
            data = {
                'suggestions': [
                    {
                        'id': s.id,
                        'market': s.market,
                        'symbol': s.symbol,
                        'side': s.side,
                        'amount': s.amount,
                        'price': s.price,
                        'confidence': s.confidence,
                        'reasoning': s.reasoning,
                        'timestamp': s.timestamp
                    }
                    for s in suggestions
                ],
                'count': len(suggestions),
                'timestamp': datetime.now().isoformat()
            }
            self.send_json_response(200, data)
            
        elif path == '/api/trading/balances':
            if not self.require_auth():
                return
            balances = trading_service.get_balances()
            self.send_json_response(200, {'balances': balances})
            
        elif path == '/api/trading/config':
            if not self.require_auth():
                return
            config = trading_service.get_config()
            self.send_json_response(200, {'config': config})
            
        elif path == '/api/trading/health':
            self.send_json_response(200, {
                'status': 'healthy',
                'trading_available': TRADING_AVAILABLE,
                'timestamp': datetime.now().isoformat()
            })
            
        elif path == '/api/auth/verify':
            user = self.get_session_user()
            if user:
                self.send_json_response(200, {'authenticated': True, 'user': user})
            else:
                self.send_json_response(200, {'authenticated': False})
            
        else:
            self.send_json_response(404, {'error': 'Not found'})
    
    def do_POST(self):
        """Handle POST requests."""
        path = self.path.split('?')[0]
        
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode() if content_length > 0 else '{}'
        
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            self.send_json_response(400, {'error': 'Invalid JSON'})
            return
        
        # Auth endpoints (no auth required)
        if path == '/api/auth/login':
            username = data.get('username', '')
            password = data.get('password', '')
            
            if verify_password(username, password):
                token = generate_session_token()
                active_sessions[token] = username
                self.send_json_response(200, {
                    'status': 'success',
                    'token': token,
                    'user': username
                })
            else:
                self.send_json_response(401, {'error': 'Invalid credentials'})
            return
        
        # Trading endpoints (auth required)
        if not self.require_auth():
            return
        
        if path == '/api/trading/execute':
            suggestion_data = data.get('suggestion', {})
            
            suggestion = TradeSuggestion(
                market=suggestion_data.get('market', 'kalshi'),
                symbol=suggestion_data.get('symbol', ''),
                side=suggestion_data.get('side', 'yes'),
                amount=float(suggestion_data.get('amount', trading_service.config['trade_size'])),
                price=float(suggestion_data.get('price', 0.5)),
                confidence=float(suggestion_data.get('confidence', 0.5)),
                reasoning=suggestion_data.get('reasoning', ''),
                timestamp=datetime.now().isoformat()
            )
            
            if trading_service.config['confirm_trades']:
                trading_service.pending_trades[suggestion.id] = suggestion
                self.send_json_response(200, {
                    'status': 'pending',
                    'trade_id': suggestion.id,
                    'message': 'Trade pending confirmation'
                })
            else:
                success = trading_service.execute_trade(suggestion)
                self.send_json_response(200, {
                    'status': 'executed' if success else 'failed',
                    'trade_id': suggestion.id
                })
                
        elif path == '/api/trading/confirm':
            trade_id = data.get('trade_id')
            if trade_id in trading_service.pending_trades:
                suggestion = trading_service.pending_trades[trade_id]
                success = trading_service.execute_trade(suggestion)
                del trading_service.pending_trades[trade_id]
                self.send_json_response(200, {
                    'status': 'executed' if success else 'failed',
                    'trade_id': trade_id
                })
            else:
                self.send_json_response(404, {'error': 'Trade not found'})
                
        elif path == '/api/trading/cancel':
            trade_id = data.get('trade_id')
            if trade_id in trading_service.pending_trades:
                del trading_service.pending_trades[trade_id]
                self.send_json_response(200, {'status': 'cancelled', 'trade_id': trade_id})
            else:
                self.send_json_response(404, {'error': 'Trade not found'})
                
        elif path == '/api/trading/config':
            trading_service.update_config(data)
            self.send_json_response(200, {
                'status': 'updated',
                'config': trading_service.get_config()
            })
                
        else:
            self.send_json_response(404, {'error': 'Not found'})
    
    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()


def run_server(port: int = 3457):
    """Run the trading service."""
    server = HTTPServer(('localhost', port), TradingAPIHandler)
    logger.info(f"🤖 Glorb Trader Service running on http://localhost:{port}")
    logger.info(f"📈 Endpoints:")
    logger.info(f"  🔐 POST   /api/auth/login         - Login")
    logger.info(f"  🔐 GET    /api/auth/verify        - Verify session")
    logger.info(f"  📈 GET    /api/trading/recommendations - Get trading recs")
    logger.info(f"  💰 GET    /api/trading/balances   - Get balances")
    logger.info(f"  ⚙️  GET    /api/trading/config     - Get config")
    logger.info(f"  🚀 POST   /api/trading/execute     - Execute trade")
    logger.info(f"  ✅ POST   /api/trading/confirm     - Confirm trade")
    logger.info(f"  ❌ POST   /api/trading/cancel      - Cancel trade")
    logger.info(f"")
    logger.info(f"🔑 Default Credentials:")
    logger.info(f"  Username: admin")
    logger.info(f"  Password: glorb2024")
    logger.info(f"")
    logger.info(f"⚠️  CHANGE PASSWORD IN trading-service.py BEFORE PRODUCTION USE")
    server.serve_forever()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3457
    run_server(port)