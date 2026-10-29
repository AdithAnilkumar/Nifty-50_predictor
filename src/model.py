import torch
import torch.nn as nn

class NiftyLSTMForecaster(nn.Module):
    """
    Multi-Step Time Series Forecasting Model for NIFTY-50.
    Predicts future High, Low, Close, and Open for the next H trading days
    given a lookback sequence of L past trading days.
    
    Experiment 13 - Course Outcome CO4:
    Sequential modeling with Long Short-Term Memory (LSTM) Recurrent Neural Networks.
    """
    def __init__(self, in_features: int = 11, hidden_dim: int = 128, num_layers: int = 2, 
                 horizon: int = 6, num_targets: int = 4, dropout: float = 0.2):
        super(NiftyLSTMForecaster, self).__init__()
        self.in_features = in_features
        self.hidden_dim = hidden_dim
        self.num_layers = num_layers
        self.horizon = horizon
        self.num_targets = num_targets
        
        # Stacked LSTM layers with dropout between layers
        self.lstm = nn.LSTM(
            input_size=in_features,
            hidden_size=hidden_dim,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0
        )
        
        # Dense multi-horizon projection head
        self.decoder = nn.Sequential(
            nn.Linear(hidden_dim, 128),
            nn.LayerNorm(128),
            nn.LeakyReLU(negative_slope=0.1),
            nn.Dropout(dropout * 0.75),
            nn.Linear(128, 64),
            nn.LeakyReLU(negative_slope=0.1),
            nn.Linear(64, horizon * num_targets)
        )
        
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: Tensor of shape (batch_size, seq_len, in_features)
        Returns:
            Tensor of shape (batch_size, horizon, num_targets)
        """
        # lstm_out shape: (batch_size, seq_len, hidden_dim)
        lstm_out, _ = self.lstm(x)
        
        # Extract the hidden state of the final timestep
        last_hidden = lstm_out[:, -1, :]  # (batch_size, hidden_dim)
        
        # Project to future horizon targets
        projected = self.decoder(last_hidden)  # (batch_size, horizon * num_targets)
        
        # Reshape to (batch_size, horizon, num_targets)
        out = projected.view(-1, self.horizon, self.num_targets)
        return out
