"use client";

export function PendingIndicator() {
  return (
    <div className="flex justify-start">
      <style>
        {`
          @keyframes pending-book-flip {
            0%, 15% {
              transform: rotateY(0deg);
              z-index: 3;
            }
            35%, 100% {
              transform: rotateY(-180deg);
              z-index: 1;
            }
          }
          .pending-book {
            position: relative;
            width: 48px;
            height: 36px;
            perspective: 150px;
          }
          .pending-book-base {
            position: absolute;
            bottom: 0;
            width: 100%;
            height: 30px;
            display: flex;
          }
          .pending-book-cover {
            width: 50%;
            height: 100%;
            background:linear-gradient(135deg, #f5e6d3 0%, #e8d4b8 100%);
            border: 1px solid var(--border-primary);
          }
          .pending-book-cover-left {
            border-radius: 2px 0 0 2px;
            transform: rotateY(15deg);
            transform-origin: right center;
            box-shadow: inset -2px 0 4px
              color-mix(in srgb, var(--text-primary) 12%, transparent);
          }
          .pending-book-cover-right {
            border-radius: 0 2px 2px 0;
            transform: rotateY(-15deg);
            transform-origin: left center;
            box-shadow: inset 2px 0 4px
              color-mix(in srgb, var(--text-primary) 12%, transparent);
          }
          .pending-book-spine {
            position: absolute;
            left: 50%;
            transform: translateX(-50%);
            width: 3px;
            height: 32px;
            bottom: -1px;
            background: linear-gradient(90deg, #8b7355 0%, #a08060 50%, #8b7355 100%);
            border-radius: 1px;
            z-index: 10;
          }
          .pending-book-pages {
            position: absolute;
            top: 2px;
            left: 50%;
            width: 21px;
            height: 27px;
            transform-style: preserve-3d;
          }
          .pending-book-page {
            position: absolute;
            width: 100%;
            height: 100%;
            transform-origin: left center;
            transform-style: preserve-3d;
            animation: pending-book-flip 3s infinite;
          }
          .pending-book-page-1 {
            animation-delay: 0s;
          }
          .pending-book-page-2 {
            animation-delay: 0.6s;
          }
          .pending-book-page-3 {
            animation-delay: 1.2s;
          }
          .pending-book-page-front,
          .pending-book-page-back {
            position: absolute;
            width: 100%;
            height: 100%;
            backface-visibility: hidden;
            border-radius: 0 1px 1px 0;
            display: flex;
            flex-direction: column;
            justify-content: center;
            padding: 2px;
            gap: 1.5px;
          }
          .pending-book-page-front {
            background: linear-gradient(90deg, #f0e6d6 0%, #faf6f0 100%);
            border: 1px solid var(--border-primary);
            border-left: none;
          }
          .pending-book-page-back {
            background: linear-gradient(90deg, #faf6f0 0%, #f0e6d6 100%);
            border: 1px solid var(--border-primary);
            border-left: none;
            transform: rotateY(180deg);
          }
          .pending-book-line {
            height: 1px;
            background: var(--text-tertiary);
            width: 80%;
            opacity: 0.35;
          }
        `}
      </style>
      <div className="pending-book">
        <div className="pending-book-base">
          <div className="pending-book-cover pending-book-cover-left" />
          <div className="pending-book-cover pending-book-cover-right" />
        </div>
        <div className="pending-book-spine" />
        <div className="pending-book-pages">
          <div className="pending-book-page pending-book-page-1">
            <div className="pending-book-page-front">
              <div className="pending-book-line" />
              <div className="pending-book-line" />
              <div className="pending-book-line" />
              <div className="pending-book-line" />
            </div>
            <div className="pending-book-page-back">
              <div className="pending-book-line" />
              <div className="pending-book-line" />
              <div className="pending-book-line" />
              <div className="pending-book-line" />
            </div>
          </div>
          <div className="pending-book-page pending-book-page-2">
            <div className="pending-book-page-front">
              <div className="pending-book-line" />
              <div className="pending-book-line" />
              <div className="pending-book-line" />
              <div className="pending-book-line" />
            </div>
            <div className="pending-book-page-back">
              <div className="pending-book-line" />
              <div className="pending-book-line" />
              <div className="pending-book-line" />
              <div className="pending-book-line" />
            </div>
          </div>
          <div className="pending-book-page pending-book-page-3">
            <div className="pending-book-page-front">
              <div className="pending-book-line" />
              <div className="pending-book-line" />
              <div className="pending-book-line" />
              <div className="pending-book-line" />
            </div>
            <div className="pending-book-page-back">
              <div className="pending-book-line" />
              <div className="pending-book-line" />
              <div className="pending-book-line" />
              <div className="pending-book-line" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
